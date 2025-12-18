import { PrismaClient } from '@prisma/client';
import { RachioClient, RachioRateLimitError } from '../clients/rachio';

const prisma = new PrismaClient();

export async function pollRachioData(): Promise<void> {
  const apiKey = process.env.RACHIO_API_KEY;

  if (!apiKey) {
    console.error('Rachio API key not configured');
    return;
  }

  const client = new RachioClient(apiKey);

  try {
    console.log('Starting Rachio data poll...');

    // Get all devices with retry logic for rate limits
    let devices;
    try {
      devices = await client.getDevices();
    } catch (error: any) {
      // If we hit a rate limit, log and skip this poll
      if (error.message?.includes('429') || error.response?.status === 429) {
        console.warn('Rachio API rate limit hit, skipping this poll cycle');
        return;
      }
      throw error;
    }

    if (devices.length === 0) {
      console.warn('No Rachio devices found');
      return;
    }

    // Process each device
    for (const device of devices) {
      // Upsert device
      await prisma.rachioDevice.upsert({
        where: { id: device.id },
        update: {
          name: device.name,
          status: device.status,
          rawPayload: device as unknown as object,
        },
        create: {
          id: device.id,
          name: device.name,
          status: device.status,
          rawPayload: device as unknown as object,
        },
      });

      console.log(`Processed device: ${device.id} (${device.name})`);

      // Get zones for this device
      const zones = await client.getZones(device.id);

      // Upsert zones
      for (const zone of zones) {
        await prisma.rachioZone.upsert({
          where: { id: zone.id },
          update: {
            name: zone.name,
            enabled: zone.enabled,
            rawPayload: zone as unknown as object,
          },
          create: {
            id: zone.id,
            deviceId: device.id,
            name: zone.name,
            enabled: zone.enabled,
            rawPayload: zone as unknown as object,
          },
        });

        console.log(`  Processed zone: ${zone.id} (${zone.name})`);
      }

      // Fetch device events from Rachio API to get schedule watering events
      // Look back 24 hours to catch recent schedule runs
      const twentyFourHoursAgoMs = Date.now() - 24 * 60 * 60 * 1000;
      const now = Date.now();
      
      // Create a map of zone names to zone IDs for this device
      const zoneNameToIdMap = new Map<string, string>();
      for (const zone of zones) {
        zoneNameToIdMap.set(zone.name.toLowerCase(), zone.id);
        // Also map zone numbers (e.g., "Zone 1" -> zone.id)
        const zoneNumberMatch = zone.name.match(/zone\s*(\d+)/i);
        if (zoneNumberMatch) {
          zoneNameToIdMap.set(`zone ${zoneNumberMatch[1]}`.toLowerCase(), zone.id);
        }
      }
      
      try {
        const deviceEvents = await client.getDeviceEvents(device.id, twentyFourHoursAgoMs, now);
        console.log(`  Fetched ${deviceEvents.length} device events for device ${device.id}`);
        
        // Debug: Log all events to see their structure
        if (deviceEvents.length > 0) {
          console.log(`  Sample event structure:`, JSON.stringify(deviceEvents[0], null, 2));
        }
        
        // Process events to find schedule watering events
        // Only process events with category='SCHEDULE', type='SCHEDULE_STATUS', and subType='SCHEDULE_COMPLETED'
        for (const event of deviceEvents) {
          // Parse event timestamp - eventDate is in milliseconds
          if (!event.eventDate || typeof event.eventDate !== 'number') {
            console.log(`  Skipping event - no valid eventDate:`, event.id, event.category, event.type);
            continue; // Skip events without valid timestamps
          }
          
          const eventTimestamp = new Date(event.eventDate);
          if (isNaN(eventTimestamp.getTime())) {
            console.log(`  Skipping event - invalid timestamp:`, event.id, event.eventDate);
            continue; // Skip invalid timestamps
          }
          
          // Check if this is a schedule completion event
          // Only process events with category='SCHEDULE', type='SCHEDULE_STATUS', and subType='SCHEDULE_COMPLETED'
          const isScheduleEvent = 
            event.category === 'SCHEDULE' && 
            event.type === 'SCHEDULE_STATUS' &&
            event.subType === 'SCHEDULE_COMPLETED' &&
            event.summary;
          
          if (!isScheduleEvent) {
            console.log(`  Skipping event - not a schedule completion:`, {
              id: event.id,
              category: event.category,
              type: event.type,
              subType: event.subType,
              summary: event.summary?.substring(0, 100)
            });
            continue; // Skip non-schedule events
          }
          
          console.log(`  Processing schedule event:`, {
            id: event.id,
            category: event.category,
            type: event.type,
            subType: event.subType,
            summary: event.summary
          });
          
          // Parse zone name from summary
          // Format: "Zone X ran for Y minutes."
          const summary = event.summary.toLowerCase();
          let zoneName: string | null = null;
          
          // Pattern 1: "Zone 1", "Zone 2", etc. - most common pattern
          const zoneNumberMatch = summary.match(/zone\s*(\d+)/);
          if (zoneNumberMatch) {
            zoneName = `zone ${zoneNumberMatch[1]}`.toLowerCase();
          } else {
            // Pattern 2: Zone name appears before "completed" or "ran for" (e.g., "Zone Frontyard completed")
            const zoneNameMatch = summary.match(/zone\s+([^ya\s]+?)\s+(?:ya\s+)?(?:completed|ran\s+for)/i);
            if (zoneNameMatch) {
              zoneName = zoneNameMatch[1].trim().toLowerCase();
            }
          }
          
          if (!zoneName) {
            console.warn(`  Could not parse zone name from event summary: ${event.summary}`);
            continue;
          }
          
          // Find zone ID by matching zone name
          const zoneId = zoneNameToIdMap.get(zoneName);
          if (!zoneId) {
            console.warn(`  Could not find zone ID for zone name "${zoneName}" from event: ${event.summary}`);
            continue;
          }
          
          // Parse duration from summary
          // Format: "Zone X ran for Y minutes."
          let durationSec: number | null = null;
          
          // Pattern 1: "ran for X minutes" or "for X minutes"
          const ranForMatch = summary.match(/(?:ran\s+for|for)\s+(\d+)\s+minute/i);
          if (ranForMatch) {
            durationSec = parseInt(ranForMatch[1], 10) * 60;
          } else {
            // Pattern 2: "with a duration of X minutes"
            const durationMinutesMatch = summary.match(/duration\s+of\s+(\d+)\s+minute/i);
            if (durationMinutesMatch) {
              durationSec = parseInt(durationMinutesMatch[1], 10) * 60;
            } else {
              // Pattern 3: "with a duration of X seconds"
              const durationSecondsMatch = summary.match(/duration\s+of\s+(\d+)\s+second/i);
              if (durationSecondsMatch) {
                durationSec = parseInt(durationSecondsMatch[1], 10);
              }
            }
          }
          
          if (!durationSec || durationSec <= 0) {
            console.warn(`  Could not parse duration from event summary: ${event.summary}`);
            continue;
          }
          
          // Check if we already have this event stored (within 5 minutes window)
          // Also check if this is actually an automation event, not a schedule event
          const timeWindowStart = new Date(eventTimestamp.getTime() - 5 * 60 * 1000);
          const timeWindowEnd = new Date(eventTimestamp.getTime() + 5 * 60 * 1000);
          
          const existingScheduleEvent = await prisma.wateringEvent.findFirst({
            where: {
              zoneId: zoneId,
              timestamp: {
                gte: timeWindowStart,
                lte: timeWindowEnd,
              },
              durationSec: {
                // Allow some variance in duration (within 10 seconds)
                gte: durationSec - 10,
                lte: durationSec + 10,
              },
              source: 'schedule',
            },
          });
          
          // Check if this is actually an automation event (automations create watering events with source='automation')
          const existingAutomationEvent = await prisma.wateringEvent.findFirst({
            where: {
              zoneId: zoneId,
              timestamp: {
                gte: timeWindowStart,
                lte: timeWindowEnd,
              },
              durationSec: {
                // Allow some variance in duration (within 10 seconds)
                gte: durationSec - 10,
                lte: durationSec + 10,
              },
              source: 'automation',
            },
          });
          
          // Also check audit logs for automation_triggered entries around this time
          const automationAuditLogs = await prisma.auditLog.findMany({
            where: {
              action: 'automation_triggered',
              source: 'automation',
              timestamp: {
                gte: timeWindowStart,
                lte: timeWindowEnd,
              },
            },
          });
          
          // Check if any automation_triggered log includes this zoneId in resultDetails.zoneIds
          let isAutomationTriggered = false;
          for (const log of automationAuditLogs) {
            const details = log.details as any;
            const zoneIds = details?.resultDetails?.zoneIds || [];
            if (Array.isArray(zoneIds) && zoneIds.includes(zoneId)) {
              isAutomationTriggered = true;
              break;
            }
          }
          
          // Also check for run_zone audit log entries (automations create these when they run zones)
          const automationRunZoneLogs = await prisma.auditLog.findMany({
            where: {
              action: 'run_zone',
              source: 'automation',
              timestamp: {
                gte: timeWindowStart,
                lte: timeWindowEnd,
              },
            },
          });
          
          // Check if any run_zone log is for this specific zone
          let isAutomationRunZone = false;
          for (const log of automationRunZoneLogs) {
            const runZoneDetails = log.details as any;
            // Check single zoneId field
            if (runZoneDetails?.zoneId === zoneId) {
              isAutomationRunZone = true;
              break;
            }
            // Also check zoneIds array if present
            const zoneIds = runZoneDetails?.zoneIds || [];
            if (Array.isArray(zoneIds) && zoneIds.includes(zoneId)) {
              isAutomationRunZone = true;
              break;
            }
          }
          
          if (existingAutomationEvent || isAutomationTriggered || isAutomationRunZone) {
            console.log(`  Skipping event - already exists as automation event for zone ${zoneName} (${zoneId}) at ${eventTimestamp.toISOString()}`);
            continue; // Don't store as schedule event if it's actually an automation
          }
          
          if (!existingScheduleEvent) {
            // Store the watering event
            await prisma.wateringEvent.create({
              data: {
                zoneId: zoneId,
                durationSec: durationSec,
                source: 'schedule',
                timestamp: eventTimestamp,
                rawPayload: event,
              },
            });
            console.log(`  ✓ Stored schedule watering event for zone ${zoneName} (${zoneId}), duration ${durationSec}s at ${eventTimestamp.toISOString()}`);
          } else {
            console.log(`  Skipping duplicate schedule event for zone ${zoneName} (${zoneId}) at ${eventTimestamp.toISOString()}`);
          }
        }
      } catch (error: any) {
        // Don't fail the entire poll if event fetching fails (might be rate limited or API issue)
        if (error instanceof RachioRateLimitError) {
          console.warn(`  Skipping event fetch for device ${device.id} due to rate limit`);
        } else {
          console.warn(`  Could not fetch device events for device ${device.id}:`, error.message || error);
        }
      }

      // Check for schedule watering events that don't have audit log entries yet
      // Look for watering events with source='schedule' from the last 24 hours
      // (increased from 6 hours to catch events that may have been stored but not yet processed)
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentScheduleEvents = await prisma.wateringEvent.findMany({
        where: {
          zone: {
            deviceId: device.id,
          },
          source: 'schedule',
          timestamp: {
            gte: twentyFourHoursAgo,
          },
        },
        include: {
          zone: true,
        },
        orderBy: {
          timestamp: 'desc',
        },
      });
      
      console.log(`  Found ${recentScheduleEvents.length} schedule watering events from last 24 hours for device ${device.id}`);

      // Get latest weather reading for weather stats
      const latestWeather = await prisma.weatherReading.findFirst({
        orderBy: { timestamp: 'desc' },
      });

      // Group watering events by approximate time window (within 5 minutes) to identify schedule runs
      const scheduleRuns = new Map<string, typeof recentScheduleEvents>();
      
      // Get all existing audit log entries for schedule runs in this time window to avoid duplicates
      const existingAuditLogs = await prisma.auditLog.findMany({
        where: {
          action: 'rachio_schedule_ran',
          source: 'rachio_schedule',
          timestamp: {
            gte: twentyFourHoursAgo,
          },
        },
      });
      
      // Extract watering event IDs from existing audit logs
      const loggedEventIds = new Set<string>();
      for (const log of existingAuditLogs) {
        const details = log.details as any;
        if (details.wateringEventIds && Array.isArray(details.wateringEventIds)) {
          details.wateringEventIds.forEach((id: string) => loggedEventIds.add(id));
        }
      }
      
      console.log(`  Processing ${recentScheduleEvents.length} schedule events, ${loggedEventIds.size} already logged`);
      
      for (const event of recentScheduleEvents) {
        // Skip if already logged
        if (loggedEventIds.has(event.id)) {
          console.log(`  Skipping event ${event.id} - already in audit log`);
          continue;
        }

        // Check if this event is actually an automation event
        // (it might have been incorrectly classified as schedule earlier)
        const eventTimeWindowStart = new Date(event.timestamp.getTime() - 5 * 60 * 1000);
        const eventTimeWindowEnd = new Date(event.timestamp.getTime() + 5 * 60 * 1000);
        
        const isAutomationEvent = await prisma.wateringEvent.findFirst({
          where: {
            zoneId: event.zoneId,
            timestamp: {
              gte: eventTimeWindowStart,
              lte: eventTimeWindowEnd,
            },
            durationSec: {
              gte: event.durationSec - 10,
              lte: event.durationSec + 10,
            },
            source: 'automation',
          },
        });
        
        const automationAuditLogs = await prisma.auditLog.findMany({
          where: {
            OR: [
              {
                action: 'automation_triggered',
                source: 'automation',
              },
              {
                action: 'run_zone',
                source: 'automation',
              },
            ],
            timestamp: {
              gte: eventTimeWindowStart,
              lte: eventTimeWindowEnd,
            },
          },
        });
        
        // Check if any automation log matches this zone
        let isAutomationAuditLog = false;
        for (const log of automationAuditLogs) {
          const details = log.details as any;
          
          if (log.action === 'automation_triggered') {
            // Check resultDetails.zoneIds array
            const zoneIds = details?.resultDetails?.zoneIds || [];
            if (Array.isArray(zoneIds) && zoneIds.includes(event.zoneId)) {
              isAutomationAuditLog = true;
              break;
            }
          } else if (log.action === 'run_zone') {
            // Check single zoneId field
            if (details?.zoneId === event.zoneId) {
              isAutomationAuditLog = true;
              break;
            }
            // Also check zoneIds array if present
            const zoneIds = details?.zoneIds || [];
            if (Array.isArray(zoneIds) && zoneIds.includes(event.zoneId)) {
              isAutomationAuditLog = true;
              break;
            }
          }
        }
        
        if (isAutomationEvent || isAutomationAuditLog) {
          console.log(`  Skipping event ${event.id} - appears to be an automation event, not a schedule`);
          continue;
        }

        console.log(`  Including event ${event.id} for zone ${event.zone?.name || event.zoneId} at ${event.timestamp.toISOString()}`);

        // Group events by 5-minute windows to identify schedule runs
        const timeWindow = Math.floor(event.timestamp.getTime() / (5 * 60 * 1000));
        const key = `${timeWindow}_${device.id}`;
        
        if (!scheduleRuns.has(key)) {
          scheduleRuns.set(key, []);
        }
        scheduleRuns.get(key)!.push(event);
      }

      // Create audit log entries for schedule runs
      console.log(`  Grouped into ${scheduleRuns.size} schedule run(s)`);
      for (const [, events] of scheduleRuns.entries()) {
        if (events.length === 0) continue;
        
        console.log(`  Processing schedule run with ${events.length} zone event(s)`);

        // Try to identify which schedule ran by matching zones
        // Get all schedules for this device
        let scheduleName = 'Unknown Schedule';
        let scheduleId: string | null = null;
        
        try {
          const schedules = await client.getSchedules(device.id);
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
        } catch (error) {
          console.warn(`Could not fetch schedules for device ${device.id} to identify schedule name:`, error);
        }

        // Calculate start and finish times
        const startTime = events.reduce((earliest, event) => 
          event.timestamp < earliest ? event.timestamp : earliest, events[0].timestamp
        );
        const finishTime = events.reduce((latest, event) => 
          event.timestamp > latest ? event.timestamp : latest, events[0].timestamp
        );

        // Create audit log entry for this schedule run
        await prisma.auditLog.create({
          data: {
            action: 'rachio_schedule_ran',
            details: {
              scheduleId: scheduleId,
              scheduleName: scheduleName,
              deviceId: device.id,
              deviceName: device.name,
              zones: events.map(e => ({
                zoneId: e.zoneId,
                zoneName: e.zone?.name || 'Unknown',
                durationSec: e.durationSec,
                durationMinutes: Math.round(e.durationSec / 60),
              })),
              startTime: startTime.toISOString(),
              finishTime: finishTime.toISOString(),
              totalDurationSec: events.reduce((sum, e) => sum + e.durationSec, 0),
              totalDurationMinutes: Math.round(events.reduce((sum, e) => sum + e.durationSec, 0) / 60),
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

        console.log(`Created audit log entry for schedule run: ${scheduleName} on ${device.name}`);
      }
    }

    console.log('Rachio data poll completed successfully');
  } catch (error) {
    // If rate limited, log but don't create audit log (it's expected)
    if (error instanceof RachioRateLimitError) {
      console.warn('Rachio poll skipped due to rate limit:', error.message);
      if (error.resetTime) {
        console.log(`Rate limit resets at: ${error.resetTime.toISOString()}`);
      }
      return;
    }

    console.error('Error polling Rachio data:', error);

    // Log error to audit log
    await prisma.auditLog.create({
      data: {
        action: 'rachio_poll_error',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        },
        source: 'rachio_poll_job',
      },
    });
  }
}

