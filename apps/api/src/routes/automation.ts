import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { evaluateRules, isZoneInCooldown } from '../automation/engine';
import { RachioClient, RachioRateLimitError, getRachioRateLimitStatus } from '../clients/rachio';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/automations
 * Get list of all automation rules (custom + Rachio schedules)
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    // Fetch custom automation rules from database
    const customRules = await prisma.automationRule.findMany({
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Fetch Rachio schedules for all devices
    const rachioSchedules: any[] = [];
    const apiKey = process.env.RACHIO_API_KEY;
    
    if (apiKey) {
      // Check rate limit BEFORE creating client or fetching devices
      const rateLimitStatus = getRachioRateLimitStatus();
      if (rateLimitStatus.rateLimited && rateLimitStatus.resetTime) {
        // Return custom rules but include rate limit info - don't even try to fetch schedules
        const customRulesWithSource = customRules.map(rule => ({
          ...rule,
          source: 'custom' as const,
        }));
        
        return res.status(200).json({
          rules: customRulesWithSource,
          rateLimitError: {
            rateLimitReset: rateLimitStatus.resetTime.toISOString(),
            remaining: null,
            message: `Rate limit active. Resets at ${rateLimitStatus.resetTime.toISOString()}`,
          },
        });
      }

      try {
        const client = new RachioClient(apiKey);
        const devices = await prisma.rachioDevice.findMany();

        for (const device of devices) {
          try {
            const schedules = await client.getSchedules(device.id);
            // Transform Rachio schedules to match AutomationRule format
            const transformedSchedules = schedules.map(schedule => ({
              id: `rachio_${schedule.id}`,
              name: schedule.name,
              enabled: schedule.enabled,
              conditions: {}, // Rachio schedules don't have conditions
              actions: {
                type: 'run_zone' as const,
                zoneIds: schedule.zones.map(z => z.zoneId),
                minutes: schedule.totalDuration ? Math.round(schedule.totalDuration / 60) : undefined,
              },
              lastRunAt: null,
              lastResult: null,
              createdAt: schedule.startDate ? new Date(schedule.startDate).toISOString() : new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              source: 'rachio' as const,
              deviceId: schedule.deviceId,
              deviceName: device.name,
              scheduleZones: schedule.zones, // Keep original zone data with durations
              // Pass through additional Rachio schedule fields
              scheduleJobTypes: schedule.scheduleJobTypes,
              summary: schedule.summary,
              startHour: schedule.startHour,
              startMinute: schedule.startMinute,
              operator: schedule.operator,
              startDay: schedule.startDay,
              startMonth: schedule.startMonth,
              startYear: schedule.startYear,
              interval: schedule.interval,
              startTime: schedule.startTime,
              startDate: schedule.startDate,
              endDate: schedule.endDate,
              cycleSoak: schedule.cycleSoak,
              cycleSoakStatus: schedule.cycleSoakStatus,
              cycles: schedule.cycles,
              totalDurationNoCycle: schedule.totalDurationNoCycle,
              rainDelay: schedule.rainDelay,
              waterBudget: schedule.waterBudget,
              weatherIntelligence: schedule.weatherIntelligence,
              weatherIntelligenceSensitivity: schedule.weatherIntelligenceSensitivity,
              seasonalAdjustment: schedule.seasonalAdjustment,
              color: schedule.color,
              repeat: schedule.repeat,
              externalName: schedule.externalName,
            }));
            rachioSchedules.push(...transformedSchedules);
          } catch (error) {
            // If rate limited, stop trying other devices and return early
            if (error instanceof RachioRateLimitError) {
              // Don't log - this is expected when rate limited
              // Return custom rules but include rate limit info
              const customRulesWithSource = customRules.map(rule => ({
                ...rule,
                source: 'custom' as const,
              }));
              
              return res.status(200).json({
                rules: customRulesWithSource,
                rateLimitError: {
                  rateLimitReset: error.resetTime?.toISOString() || null,
                  remaining: error.remaining,
                  message: error.message,
                },
              });
            }
            console.error(`Error fetching schedules for device ${device.id}:`, error);
            // Continue with other devices even if one fails (non-rate-limit errors)
          }
        }
      } catch (error) {
        // If rate limited, return error with reset time info
        if (error instanceof RachioRateLimitError) {
          // Return custom rules but include rate limit info
          const customRulesWithSource = customRules.map(rule => ({
            ...rule,
            source: 'custom' as const,
          }));
          
          return res.status(200).json({
            rules: customRulesWithSource,
            rateLimitError: {
              rateLimitReset: error.resetTime?.toISOString() || null,
              remaining: error.remaining,
              message: error.message,
            },
          });
        }
        console.error('Error fetching Rachio schedules:', error);
        // Continue without Rachio schedules if API fails
      }
    }

    // Mark custom rules with source
    const customRulesWithSource = customRules.map(rule => ({
      ...rule,
      source: 'custom' as const,
    }));

    // Combine and sort by name
    const allRules = [...customRulesWithSource, ...rachioSchedules].sort((a, b) => 
      a.name.localeCompare(b.name)
    );

    // Return as array (normal case) or object with rateLimitError if rate limited
    return res.json(allRules);
  } catch (error) {
    console.error('Error fetching automations:', error);
    return res.status(500).json({ error: 'Failed to fetch automations' });
  }
});

/**
 * GET /api/automations/history
 * Get history of automation runs and Rachio schedule runs
 * Query params: limit (default 100), offset (default 0)
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    // Get total count of matching audit log records for pagination
    const auditLogTotal = await prisma.auditLog.count({
      where: {
        OR: [
          {
            source: 'automation',
            action: {
              in: ['automation_triggered', 'set_rain_delay', 'run_zone'],
            },
          },
          {
            source: 'rachio_schedule',
            action: 'rachio_schedule_ran',
          },
          {
            source: 'api',
            action: {
              in: ['set_rain_delay', 'run_zone'],
            },
          },
          {
            source: 'wunderground',
            action: {
              in: ['wu_upload', 'wu_upload_failed', 'wu_upload_skipped'],
            },
          },
        ],
      },
    });

    // Query audit log for automation and schedule runs
    // Fetch enough records to account for merging with schedule events and pagination
    // We fetch offset + limit * 2 to ensure we have enough after merging
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        OR: [
          {
            source: 'automation',
            action: {
              in: ['automation_triggered', 'set_rain_delay', 'run_zone'],
            },
          },
          {
            source: 'rachio_schedule',
            action: 'rachio_schedule_ran',
          },
          {
            source: 'api',
            action: {
              in: ['set_rain_delay', 'run_zone'],
            },
          },
          {
            source: 'wunderground',
            action: {
              in: ['wu_upload', 'wu_upload_failed', 'wu_upload_skipped'],
            },
          },
        ],
      },
      orderBy: {
        timestamp: 'desc',
      },
      // Fetch enough to cover offset + limit after merging with schedule events
      take: offset + limit * 3,
      skip: 0, // Don't apply offset here - we'll apply it after merging
    });

    // Also fetch schedule watering events that don't have audit log entries
    // Get all watering event IDs that are already logged in audit logs
    const loggedWateringEventIds = new Set<string>();
    auditLogs.forEach(log => {
      if (log.source === 'rachio_schedule' && log.action === 'rachio_schedule_ran') {
        const details = log.details as any;
        if (details.wateringEventIds && Array.isArray(details.wateringEventIds)) {
          details.wateringEventIds.forEach((id: string) => loggedWateringEventIds.add(id));
        }
      }
    });

    // Fetch schedule watering events that aren't logged yet
    // Look back further than 24 hours to catch older events
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Count total unlogged schedule events for accurate pagination total
    const unloggedScheduleEventsTotal = await prisma.wateringEvent.count({
      where: {
        source: 'schedule',
        id: {
          notIn: Array.from(loggedWateringEventIds),
        },
        timestamp: {
          gte: thirtyDaysAgo,
        },
      },
    });
    
    // Fetch unlogged schedule events - fetch enough to cover pagination after grouping
    // We fetch offset + limit * 3 to ensure we have enough after grouping into schedule runs
    const unloggedScheduleEvents = await prisma.wateringEvent.findMany({
      where: {
        source: 'schedule',
        id: {
          notIn: Array.from(loggedWateringEventIds),
        },
        timestamp: {
          gte: thirtyDaysAgo,
        },
      },
      include: {
        zone: {
          select: {
            id: true,
            name: true,
            device: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      // Fetch enough to cover offset + limit after grouping into schedule runs
      take: offset + limit * 3,
      skip: 0, // Don't apply offset here - we'll apply it after merging
    });

    // Group unlogged schedule events by time window (5 minutes) and device
    const scheduleRunsFromEvents = new Map<string, typeof unloggedScheduleEvents>();
    for (const event of unloggedScheduleEvents) {
      const timeWindow = Math.floor(event.timestamp.getTime() / (5 * 60 * 1000));
      const deviceId = event.zone.device?.id || 'unknown';
      const key = `${timeWindow}_${deviceId}`;
      
      if (!scheduleRunsFromEvents.has(key)) {
        scheduleRunsFromEvents.set(key, []);
      }
      scheduleRunsFromEvents.get(key)!.push(event);
    }

    // Collect all IDs that need enrichment (for batch queries)
    const zoneIdsToFetch = new Set<string>();
    const deviceIdsToFetch = new Set<string>();
    
    auditLogs.forEach(log => {
      const details = log.details as any;
      
      // Collect zone IDs that need enrichment
      if (!details.zoneName && details.zoneId) {
        zoneIdsToFetch.add(details.zoneId);
      }
      // Collect from zoneIds array if present
      if (details.zoneIds && Array.isArray(details.zoneIds)) {
        details.zoneIds.forEach((id: string) => {
          zoneIdsToFetch.add(id);
        });
      }
      if (details.resultDetails?.successfulZoneIds && Array.isArray(details.resultDetails.successfulZoneIds)) {
        details.resultDetails.successfulZoneIds.forEach((id: string) => {
          if (!details.resultDetails.zones?.some((z: any) => z.zoneId === id)) {
            zoneIdsToFetch.add(id);
          }
        });
      }
      
      // Collect device IDs that need enrichment
      if (!details.deviceName && details.deviceId) {
        deviceIdsToFetch.add(details.deviceId);
      }
    });
    
    // Batch fetch zones and devices
    const zonesMap = new Map<string, { name: string; deviceName: string | null; deviceId: string | null }>();
    if (zoneIdsToFetch.size > 0) {
      const zones = await prisma.rachioZone.findMany({
        where: { id: { in: Array.from(zoneIdsToFetch) } },
        select: { id: true, name: true, device: { select: { id: true, name: true } } },
      });
      zones.forEach(zone => {
        zonesMap.set(zone.id, {
          name: zone.name,
          deviceName: zone.device?.name || null,
          deviceId: zone.device?.id || null,
        });
      });
    }
    
    const devicesMap = new Map<string, string>();
    if (deviceIdsToFetch.size > 0) {
      const devices = await prisma.rachioDevice.findMany({
        where: { id: { in: Array.from(deviceIdsToFetch) } },
        select: { id: true, name: true },
      });
      devices.forEach(device => {
        devicesMap.set(device.id, device.name);
      });
    }
    
    // Filter out individual action entries (set_rain_delay, run_zone) that are part of automations
    // when there's a corresponding automation_triggered summary entry
    // This prevents duplicate entries in history
    const automationTriggeredEntries = new Map<string, typeof auditLogs>();
    auditLogs.forEach(log => {
      if (log.action === 'automation_triggered') {
        const details = log.details as any;
        const ruleId = details.ruleId;
        if (ruleId) {
          // Group by ruleId and timestamp (within 1 minute) to match with individual actions
          const timeKey = Math.floor(log.timestamp.getTime() / (60 * 1000)); // Round to nearest minute
          const key = `${ruleId}_${timeKey}`;
          if (!automationTriggeredEntries.has(key)) {
            automationTriggeredEntries.set(key, []);
          }
          automationTriggeredEntries.get(key)!.push(log);
        }
      }
    });
    
    // Filter out individual action entries that have a corresponding automation_triggered entry
    const filteredAuditLogs = auditLogs.filter(log => {
      // Keep automation_triggered entries
      if (log.action === 'automation_triggered') {
        return true;
      }
      
      // Keep entries without ruleId (manual actions)
      const details = log.details as any;
      if (!details.ruleId) {
        return true;
      }
      
      // For individual action entries (set_rain_delay, run_zone) with ruleId,
      // check if there's a corresponding automation_triggered entry
      if (log.action === 'set_rain_delay' || log.action === 'run_zone') {
        const ruleId = details.ruleId;
        const timeKey = Math.floor(log.timestamp.getTime() / (60 * 1000));
        const key = `${ruleId}_${timeKey}`;
        
        // If there's a corresponding automation_triggered entry, filter this one out
        if (automationTriggeredEntries.has(key)) {
          return false; // Filter out - we'll show the summary instead
        }
      }
      
      return true; // Keep other entries
    });
    
    // Get latest weather reading for schedule events that don't have weather stats
    const latestWeather = await prisma.weatherReading.findFirst({
      orderBy: { timestamp: 'desc' },
    });

    // Create audit log entries for unlogged schedule events and convert to history entries
    const scheduleHistoryEntries = await Promise.all(
      Array.from(scheduleRunsFromEvents.values()).map(async (events) => {
        if (events.length === 0) return null;

        // Check if an audit log entry already exists for these watering event IDs
        // (in case another request created it concurrently)
        // We check by looking for entries with the same device and timestamp (within 5 minutes)
        const startTime = events.reduce((earliest, event) => 
          event.timestamp < earliest ? event.timestamp : earliest, events[0].timestamp
        );
        const firstEvent = events[0];
        const deviceId = firstEvent.zone.device?.id || null;
        
        const timeWindowStart = new Date(startTime.getTime() - 5 * 60 * 1000);
        const timeWindowEnd = new Date(startTime.getTime() + 5 * 60 * 1000);
        
        const existingAuditLog = deviceId ? await prisma.auditLog.findFirst({
          where: {
            source: 'rachio_schedule',
            action: 'rachio_schedule_ran',
            timestamp: {
              gte: timeWindowStart,
              lte: timeWindowEnd,
            },
            details: {
              path: ['deviceId'],
              equals: deviceId,
            },
          },
        }) : null;

        // If audit log already exists, convert it to history entry format
        if (existingAuditLog) {
          const details = existingAuditLog.details as any;
          return {
            id: existingAuditLog.id,
            timestamp: existingAuditLog.timestamp.toISOString(),
            type: 'schedule' as const,
            action: existingAuditLog.action,
            name: details.scheduleName || 'Schedule',
            ruleId: null,
            scheduleId: details.scheduleId || null,
            deviceId: details.deviceId || null,
            deviceName: details.deviceName || null,
            completed: details.completed ?? true,
            temperature: details.temperature ?? null,
            humidity: details.humidity ?? null,
            pressure: details.pressure ?? null,
            rain24h: details.rain24h ?? null,
            rain1h: details.rain1h ?? null,
            soilMoisture: details.soilMoisture ?? null,
            soilMoistureValues: details.soilMoistureValues ?? null,
            actionDetails: {
              zones: details.zones || [],
              startTime: details.startTime || null,
              finishTime: details.finishTime || null,
              totalDurationSec: details.totalDurationSec || null,
              totalDurationMinutes: details.totalDurationMinutes || null,
            },
          };
        }

        // Calculate start and finish times (if not already calculated above)
        const totalDurationSec = events.reduce((sum, event) => sum + event.durationSec, 0);
        const finishTime = new Date(startTime.getTime() + totalDurationSec * 1000);

        // Get device info from first event (if not already retrieved above)
        const deviceName = firstEvent.zone.device?.name || null;

        // Try to identify which schedule ran by matching zones
        let scheduleName = 'Unknown Schedule';
        let scheduleId: string | null = null;
        
        if (deviceId) {
          try {
            const apiKey = process.env.RACHIO_API_KEY;
            if (apiKey) {
              const rachioClient = new RachioClient(apiKey);
              const schedules = await rachioClient.getSchedules(deviceId);
              // Match zones from events to schedule zones
              const eventZoneIds = new Set(events.map(e => e.zoneId));
              
              for (const schedule of schedules) {
                const scheduleZoneIds = new Set(schedule.zones.map(z => z.zoneId));
                // Check if all event zones match schedule zones (or if schedule zones match event zones)
                const matches = Array.from(eventZoneIds).every(id => scheduleZoneIds.has(id)) ||
                              Array.from(scheduleZoneIds).every(id => eventZoneIds.has(id));
                
                if (matches) {
                  scheduleName = schedule.name;
                  scheduleId = schedule.id;
                  break;
                }
              }
            }
          } catch (error) {
            console.warn(`Could not fetch schedules for device ${deviceId} to identify schedule name:`, error);
            // Fallback: Create a schedule name from zones
            const zoneNames = events.map(e => e.zone.name).filter(Boolean);
            scheduleName = zoneNames.length > 0 
              ? `${zoneNames.length > 1 ? `${zoneNames.length} Zones` : zoneNames[0]} Schedule`
              : 'Schedule';
          }
        } else {
          // Fallback: Create a schedule name from zones
          const zoneNames = events.map(e => e.zone.name).filter(Boolean);
          scheduleName = zoneNames.length > 0 
            ? `${zoneNames.length > 1 ? `${zoneNames.length} Zones` : zoneNames[0]} Schedule`
            : 'Schedule';
        }

        // Create audit log entry for this schedule run
        const auditLog = await prisma.auditLog.create({
          data: {
            action: 'rachio_schedule_ran',
            details: {
              scheduleId: scheduleId,
              scheduleName: scheduleName,
              deviceId: deviceId,
              deviceName: deviceName,
              zones: events.map(e => ({
                zoneId: e.zoneId,
                zoneName: e.zone.name,
                durationSec: e.durationSec,
                durationMinutes: Math.round(e.durationSec / 60),
              })),
              startTime: startTime.toISOString(),
              finishTime: finishTime.toISOString(),
              totalDurationSec: totalDurationSec,
              totalDurationMinutes: Math.round(totalDurationSec / 60),
              wateringEventIds: events.map(e => e.id),
              completed: true,
              temperature: latestWeather?.temperature ?? null,
              humidity: latestWeather?.humidity ?? null,
              pressure: latestWeather?.pressure ?? null,
              rain24h: latestWeather?.rain24h ?? null,
              rain1h: latestWeather?.rain1h ?? null,
              soilMoisture: latestWeather?.soilMoisture ?? null,
              soilMoistureValues: latestWeather?.soilMoistureValues ?? null,
            },
            source: 'rachio_schedule',
            timestamp: startTime, // Use start time as the timestamp
          },
        });

        // Convert to history entry format
        return {
          id: auditLog.id,
          timestamp: auditLog.timestamp.toISOString(),
          type: 'schedule' as const,
          action: auditLog.action,
          name: scheduleName,
          ruleId: null,
          scheduleId: scheduleId,
          deviceId: deviceId,
          deviceName: deviceName,
          completed: true,
          // Weather stats
          temperature: latestWeather?.temperature ?? null,
          humidity: latestWeather?.humidity ?? null,
          pressure: latestWeather?.pressure ?? null,
          rain24h: latestWeather?.rain24h ?? null,
          rain1h: latestWeather?.rain1h ?? null,
          soilMoisture: latestWeather?.soilMoisture ?? null,
          soilMoistureValues: latestWeather?.soilMoistureValues ?? null,
          // Action-specific details
          actionDetails: {
            zones: events.map(e => ({
              zoneId: e.zoneId,
              zoneName: e.zone.name,
              durationSec: e.durationSec,
              durationMinutes: Math.round(e.durationSec / 60),
            })),
            startTime: startTime.toISOString(),
            finishTime: finishTime.toISOString(),
            totalDurationSec: totalDurationSec,
            totalDurationMinutes: Math.round(totalDurationSec / 60),
          },
        };
      })
    );
    
    // Filter out null entries
    const validScheduleEntries = scheduleHistoryEntries.filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    // Transform audit logs to history entries
    const auditHistoryEntries = filteredAuditLogs.map((log) => {
      const details = log.details as any;
      
      // Determine type and extract relevant information
      const isSchedule = log.source === 'rachio_schedule';
      const isManual = log.source === 'api';
      const isWunderground = log.source === 'wunderground';
      
      // Enrich actions with zone/device names using batch-fetched data
      let deviceName = details.deviceName || null;
      let zoneName = details.zoneName || null;
      
      // For automation-triggered entries, extract zone info from resultDetails
      if (log.action === 'automation_triggered' && details.resultDetails) {
        const resultDetails = details.resultDetails as any;
        if (resultDetails.zones && Array.isArray(resultDetails.zones) && resultDetails.zones.length > 0) {
          // Use zone info from resultDetails if available
          const firstZone = resultDetails.zones[0];
          zoneName = firstZone.zoneName || zoneName;
          deviceName = firstZone.deviceName || deviceName;
        } else if (resultDetails.successfulZoneIds && Array.isArray(resultDetails.successfulZoneIds) && resultDetails.successfulZoneIds.length > 0 && !zoneName) {
          // Fallback: Use batch-fetched zone data
          const zoneData = zonesMap.get(resultDetails.successfulZoneIds[0]);
          if (zoneData) {
            zoneName = zoneData.name;
            deviceName = zoneData.deviceName || deviceName;
          }
        }
      }
      
      // Fallback enrichment for older entries using batch-fetched data
      if (!zoneName && details.zoneId) {
        const zoneData = zonesMap.get(details.zoneId);
        if (zoneData) {
          zoneName = zoneData.name;
          deviceName = zoneData.deviceName || deviceName;
        }
      }
      
      if (!deviceName && details.deviceId) {
        const deviceData = devicesMap.get(details.deviceId);
        if (deviceData) {
          deviceName = deviceData;
        }
      }
      
      // Extract minutes from resultDetails if not present
      let minutes = details.minutes || null;
      if (!minutes && details.resultDetails?.durationSec) {
        minutes = Math.round(details.resultDetails.durationSec / 60);
      }
      
      // Handle WU upload entries specially
      if (isWunderground) {
        return {
          id: log.id,
          timestamp: log.timestamp.toISOString(),
          type: 'automation' as const,
          action: log.action,
          name: 'Weather Underground Upload',
          ruleId: null,
          scheduleId: null,
          deviceId: null,
          deviceName: null,
          completed: log.action === 'wu_upload',
          // Weather stats
          temperature: details.temperature ?? null,
          humidity: details.humidity ?? null,
          pressure: details.pressure ?? null,
          rain24h: details.rain24h ?? null,
          rain1h: details.rain1h ?? null,
          soilMoisture: null,
          soilMoistureValues: null,
          // Action-specific details
          actionDetails: {
            action: log.action,
            wuResponse: details.wuResponse || null,
            computedFields: details.computedFields || null,
            payload: details.payload || null,
            error: details.error || null,
            skipped: log.action === 'wu_upload_skipped',
            reason: details.reason || null,
          },
        };
      }

      return {
        id: log.id,
        timestamp: log.timestamp.toISOString(),
        type: isSchedule ? 'schedule' : 'automation',
        action: log.action,
        name: details.ruleName || details.scheduleName || (isManual ? 'Manual Action' : 'Unknown'),
        ruleId: details.ruleId || null,
        scheduleId: details.scheduleId || null,
        deviceId: details.deviceId || null,
        deviceName: deviceName,
        completed: details.completed ?? true,
        // Weather stats
        temperature: details.temperature ?? null,
        humidity: details.humidity ?? null,
        pressure: details.pressure ?? null,
        rain24h: details.rain24h ?? null,
        rain1h: details.rain1h ?? null,
        soilMoisture: details.soilMoisture ?? null,
        soilMoistureValues: details.soilMoistureValues ?? null,
        // Action-specific details
        actionDetails: isSchedule ? {
          zones: details.zones || [],
          startTime: details.startTime || null,
          finishTime: details.finishTime || null,
          totalDurationSec: details.totalDurationSec || null,
          totalDurationMinutes: details.totalDurationMinutes || null,
        } : {
          action: details.action || log.action,
          hours: details.hours || null,
          minutes: minutes,
          zoneIds: details.zoneIds || (details.resultDetails?.successfulZoneIds || (details.zoneId ? [details.zoneId] : [])).filter(Boolean),
          deviceIds: details.successfulDeviceIds || (details.deviceId ? [details.deviceId] : []).filter(Boolean),
          resultDetails: details.resultDetails || null,
          zoneName: zoneName || null,
          // Include zone info from resultDetails for automation-triggered entries
          zones: details.resultDetails?.zones || null,
        },
      };
    });

    // Merge audit log entries and schedule event entries, then sort by timestamp
    const allHistoryEntries = [...auditHistoryEntries, ...validScheduleEntries];
    allHistoryEntries.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeB - timeA; // Descending order (newest first)
    });

    // Apply pagination to the merged and sorted results (only once, here)
    const paginatedEntries = allHistoryEntries.slice(offset, offset + limit);

    // Calculate accurate total count
    // Count the actual schedule runs we created from fetched unlogged events
    const scheduleRunsCount = scheduleRunsFromEvents.size;
    const newlyCreatedAuditLogsCount = validScheduleEntries.length;
    
    // Estimate total unlogged schedule runs (including ones we just created audit logs for):
    // - If we fetched all unlogged events, use the exact count of schedule runs we created
    // - Otherwise, estimate based on the ratio of fetched events to total events
    //   (assuming schedule runs scale proportionally with events)
    let estimatedTotalScheduleRuns: number;
    if (unloggedScheduleEventsTotal === 0) {
      estimatedTotalScheduleRuns = 0;
    } else if (unloggedScheduleEvents.length >= unloggedScheduleEventsTotal) {
      // We fetched all unlogged events, so we have the exact count
      // All unlogged schedule runs are now represented by newly created audit logs
      estimatedTotalScheduleRuns = newlyCreatedAuditLogsCount;
    } else {
      // We didn't fetch all events, so estimate proportionally
      // This assumes schedule runs scale roughly proportionally with events
      const fetchedRatio = unloggedScheduleEvents.length / unloggedScheduleEventsTotal;
      estimatedTotalScheduleRuns = Math.ceil(newlyCreatedAuditLogsCount / Math.max(fetchedRatio, 0.001));
    }
    
    // Total count calculation:
    // - auditLogTotal: count of existing audit logs (counted BEFORE we created new ones)
    // - newlyCreatedAuditLogsCount: audit log entries we just created for unlogged schedule events
    // - estimatedTotalScheduleRuns: total estimate of all schedule runs
    //
    // The total should include:
    // 1. All existing audit logs (auditLogTotal) - this includes some schedule runs that were already logged
    // 2. Newly created audit log entries (newlyCreatedAuditLogsCount) - these are now in the database
    // 3. Estimated remaining unlogged schedule runs (estimatedTotalScheduleRuns - newlyCreatedAuditLogsCount)
    //
    // Since auditLogTotal was counted before we created new entries, we need to add:
    // - The newly created audit log entries
    // - Any remaining unlogged schedule runs (if we didn't fetch all events)
    //
    // Formula: auditLogTotal + newlyCreatedAuditLogsCount + max(0, estimatedTotalScheduleRuns - newlyCreatedAuditLogsCount)
    // = auditLogTotal + max(newlyCreatedAuditLogsCount, estimatedTotalScheduleRuns)
    //
    // This ensures:
    // - If we fetched all events: total = auditLogTotal + newlyCreatedAuditLogsCount (all schedule runs are now logged)
    // - If we didn't fetch all: total = auditLogTotal + estimatedTotalScheduleRuns (includes estimate of remaining unlogged runs)
    const totalWithSchedules = auditLogTotal + Math.max(newlyCreatedAuditLogsCount, estimatedTotalScheduleRuns);

    return res.json({
      entries: paginatedEntries,
      total: totalWithSchedules,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching automation history:', error);
    return res.status(500).json({ error: 'Failed to fetch automation history' });
  }
});

/**
 * GET /api/automations/:id
 * Get a single automation rule by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rule = await prisma.automationRule.findUnique({
      where: { id },
    });

    if (!rule) {
      return res.status(404).json({ error: 'Automation rule not found' });
    }

    return res.json(rule);
  } catch (error) {
    console.error('Error fetching automation:', error);
    return res.status(500).json({ error: 'Failed to fetch automation' });
  }
});

/**
 * Validate sensor condition format
 */
function validateSensorCondition(condition: any): boolean {
  if (!condition || typeof condition !== 'object') {
    return false;
  }

  // Check if it's the new format (has sensors array)
  if ('sensors' in condition) {
    if (!Array.isArray(condition.sensors) || condition.sensors.length === 0) {
      return false;
    }

    // Validate each sensor condition
    for (const sensor of condition.sensors) {
      if (
        typeof sensor.channel !== 'number' ||
        sensor.channel < 1 ||
        sensor.channel > 16 ||
        !['>=', '<=', '>', '<', '=='].includes(sensor.operator) ||
        typeof sensor.value !== 'number'
      ) {
        return false;
      }
    }

    // Validate logic operator if present
    if (condition.logic && !['AND', 'OR'].includes(condition.logic)) {
      return false;
    }

    return true;
  }

  // Old format: single condition with operator and value
  if (
    !['>=', '<=', '>', '<', '=='].includes(condition.operator) ||
    typeof condition.value !== 'number'
  ) {
    return false;
  }

  return true;
}

/**
 * POST /api/automations
 * Create a new automation rule
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, enabled = true, conditions, actions } = req.body;

    if (!name || !conditions || !actions) {
      return res.status(400).json({ error: 'Missing required fields: name, conditions, actions' });
    }

    // Validate soilMoisture condition format if present
    if (conditions.soilMoisture && !validateSensorCondition(conditions.soilMoisture)) {
      return res.status(400).json({ 
        error: 'Invalid soilMoisture condition format. Must be { operator, value } or { sensors: [{ channel, operator, value }], logic?: "AND"|"OR" }' 
      });
    }

    const rule = await prisma.automationRule.create({
      data: {
        name,
        enabled: enabled ?? true,
        conditions: conditions as object,
        actions: actions as object,
      },
    });

    return res.status(201).json(rule);
  } catch (error) {
    console.error('Error creating automation:', error);
    return res.status(500).json({ error: 'Failed to create automation' });
  }
});

/**
 * PUT /api/automations/:id
 * Update an existing automation rule
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, enabled, conditions, actions } = req.body;

    // Check if rule exists
    const existing = await prisma.automationRule.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Automation rule not found' });
    }

    // Build update data
    const updateData: {
      name?: string;
      enabled?: boolean;
      conditions?: object;
      actions?: object;
    } = {};

    if (name !== undefined) updateData.name = name;
    if (enabled !== undefined) updateData.enabled = enabled;
    if (conditions !== undefined) {
      // Validate soilMoisture condition format if present
      if (conditions.soilMoisture && !validateSensorCondition(conditions.soilMoisture)) {
        return res.status(400).json({ 
          error: 'Invalid soilMoisture condition format. Must be { operator, value } or { sensors: [{ channel, operator, value }], logic?: "AND"|"OR" }' 
        });
      }
      updateData.conditions = conditions as object;
    }
    if (actions !== undefined) updateData.actions = actions as object;

    const rule = await prisma.automationRule.update({
      where: { id },
      data: updateData,
    });

    return res.json(rule);
  } catch (error) {
    console.error('Error updating automation:', error);
    return res.status(500).json({ error: 'Failed to update automation' });
  }
});

/**
 * DELETE /api/automations/:id
 * Delete an automation rule
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const rule = await prisma.automationRule.findUnique({
      where: { id },
    });

    if (!rule) {
      return res.status(404).json({ error: 'Automation rule not found' });
    }

    await prisma.automationRule.delete({
      where: { id },
    });

    return res.json({ success: true, message: 'Automation rule deleted' });
  } catch (error) {
    console.error('Error deleting automation:', error);
    return res.status(500).json({ error: 'Failed to delete automation' });
  }
});

/**
 * POST /api/automations/:id/enable
 * Enable an automation rule
 */
router.post('/:id/enable', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const rule = await prisma.automationRule.update({
      where: { id },
      data: { enabled: true },
    });

    return res.json(rule);
  } catch (error) {
    console.error('Error enabling automation:', error);
    return res.status(500).json({ error: 'Failed to enable automation' });
  }
});

/**
 * POST /api/automations/:id/disable
 * Disable an automation rule
 */
router.post('/:id/disable', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const rule = await prisma.automationRule.update({
      where: { id },
      data: { enabled: false },
    });

    return res.json(rule);
  } catch (error) {
    console.error('Error disabling automation:', error);
    return res.status(500).json({ error: 'Failed to disable automation' });
  }
});

/**
 * POST /api/automations/run
 * Manually trigger automation evaluation
 */
router.post('/run', async (_req: Request, res: Response) => {
  try {
    await evaluateRules();
    return res.json({ success: true, message: 'Automation rules evaluated' });
  } catch (error) {
    console.error('Error running automations:', error);
    return res.status(500).json({ error: 'Failed to run automations' });
  }
});

/**
 * GET /api/automations/:id/status
 * Check if an automation rule is currently "in effect"
 * Returns { inEffect: boolean } where inEffect is true if:
 * - For set_rain_delay: rain delay hasn't expired yet
 * - For run_zone: zones are still in cooldown period
 */
router.get('/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get the rule to check its action type
    const rule = await prisma.automationRule.findUnique({
      where: { id },
    });

    if (!rule) {
      return res.status(404).json({ error: 'Automation rule not found' });
    }

    // Only check custom rules (Rachio schedules don't have this concept)
    const actions = rule.actions as any;

    // Check for set_rain_delay action
    if (actions.type === 'set_rain_delay') {
      // Find most recent set_rain_delay entries and filter for this rule
      // We fetch multiple entries since Prisma doesn't easily filter JSON fields
      const rainDelayEntries = await prisma.auditLog.findMany({
        where: {
          source: 'automation',
          action: 'set_rain_delay',
        },
        orderBy: { timestamp: 'desc' },
        take: 50, // Check last 50 entries to find one for this rule
      });

      // Find the most recent entry for this rule
      for (const entry of rainDelayEntries) {
        const details = entry.details as any;
        if (details.ruleId === id) {
          const hours = details.hours;
          if (hours && typeof hours === 'number') {
            const expirationTime = new Date(entry.timestamp.getTime() + hours * 3600 * 1000);
            const inEffect = expirationTime > new Date();
            return res.json({ inEffect });
          }
        }
      }
    }

    // Check for run_zone action
    if (actions.type === 'run_zone') {
      // Find most recent automation_triggered entries and filter for this rule
      // We fetch multiple entries since Prisma doesn't easily filter JSON fields
      const automationEntries = await prisma.auditLog.findMany({
        where: {
          source: 'automation',
          action: 'automation_triggered',
        },
        orderBy: { timestamp: 'desc' },
        take: 50, // Check last 50 entries to find one for this rule
      });

      // Find the most recent entry for this rule
      for (const entry of automationEntries) {
        const details = entry.details as any;
        if (details.ruleId === id && details.resultDetails) {
          const zoneIds = details.resultDetails.zoneIds || [];
          
          // Check if any zone is still in cooldown
          for (const zoneId of zoneIds) {
            const zone = await prisma.rachioZone.findUnique({
              where: { id: zoneId },
              select: { cooldownPeriodDays: true },
            });
            
            if (zone?.cooldownPeriodDays && zone.cooldownPeriodDays > 0) {
              const inCooldown = await isZoneInCooldown(zoneId, zone.cooldownPeriodDays);
              if (inCooldown) {
                return res.json({ inEffect: true });
              }
            }
          }
          // If we found the entry but no zones are in cooldown, break to return false
          break;
        }
      }
    }

    // No active action found
    return res.json({ inEffect: false });
  } catch (error) {
    console.error('Error checking rule status:', error);
    return res.status(500).json({ error: 'Failed to check rule status' });
  }
});

export default router;

