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

      // Check for schedule watering events that don't have audit log entries yet
      // Look for watering events with source='schedule' from the last 6 hours
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
      const recentScheduleEvents = await prisma.wateringEvent.findMany({
        where: {
          zone: {
            deviceId: device.id,
          },
          source: 'schedule',
          timestamp: {
            gte: sixHoursAgo,
          },
        },
        include: {
          zone: true,
        },
        orderBy: {
          timestamp: 'desc',
        },
      });

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
            gte: sixHoursAgo,
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
      
      for (const event of recentScheduleEvents) {
        // Skip if already logged
        if (loggedEventIds.has(event.id)) {
          continue;
        }

        // Group events by 5-minute windows to identify schedule runs
        const timeWindow = Math.floor(event.timestamp.getTime() / (5 * 60 * 1000));
        const key = `${timeWindow}_${device.id}`;
        
        if (!scheduleRuns.has(key)) {
          scheduleRuns.set(key, []);
        }
        scheduleRuns.get(key)!.push(event);
      }

      // Create audit log entries for schedule runs
      for (const [key, events] of scheduleRuns.entries()) {
        if (events.length === 0) continue;

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
                zoneName: e.zone.name,
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

