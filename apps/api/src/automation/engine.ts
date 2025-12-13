import { PrismaClient } from '@prisma/client';
import { RachioClient } from '../clients/rachio';
import {
  RAIN_DELAY_THRESHOLD_INCHES,
  RAIN_DELAY_DURATION_HOURS,
  SOIL_MOISTURE_HIGH_THRESHOLD_PERCENT,
  SOIL_MOISTURE_LOW_THRESHOLD_PERCENT,
  DRY_WATERING_DURATION_MINUTES,
  DRY_RAIN_THRESHOLD_INCHES,
} from './constants';
import { findLawnZone } from './zoneFinder';

const prisma = new PrismaClient();

interface AutomationResult {
  rule: string;
  triggered: boolean;
  action?: string;
  details?: Record<string, unknown>;
}

/**
 * Evaluate all automation rules
 * Runs every 5 minutes via cron job
 */
export async function evaluateRules(): Promise<void> {
  const apiKey = process.env.RACHIO_API_KEY;
  if (!apiKey) {
    console.error('Rachio API key not configured, skipping automation');
    return;
  }

  const rachioClient = new RachioClient(apiKey);

  try {
    // Get latest weather reading
    const latestWeather = await prisma.weatherReading.findFirst({
      orderBy: {
        timestamp: 'desc',
      },
    });

    if (!latestWeather) {
      console.log('No weather data available, skipping automation');
      return;
    }

    // Get all Rachio devices
    const devices = await prisma.rachioDevice.findMany();
    if (devices.length === 0) {
      console.log('No Rachio devices found, skipping automation');
      return;
    }

    const results: AutomationResult[] = [];

    // Rule 1: Rainy Day Pause
    // If rain_24h >= 0.5" → set rain delay 48h
    if (latestWeather.rain24h !== null && latestWeather.rain24h >= RAIN_DELAY_THRESHOLD_INCHES) {
      for (const device of devices) {
        try {
          await rachioClient.setRainDelay(device.id, RAIN_DELAY_DURATION_HOURS);
          
          results.push({
            rule: 'rainy_day_pause',
            triggered: true,
            action: `set_rain_delay_${RAIN_DELAY_DURATION_HOURS}h`,
            details: {
              deviceId: device.id,
              rain24h: latestWeather.rain24h,
              threshold: RAIN_DELAY_THRESHOLD_INCHES,
            },
          });

          // Log to audit log
          await prisma.auditLog.create({
            data: {
              action: 'set_rain_delay',
              details: {
                deviceId: device.id,
                hours: RAIN_DELAY_DURATION_HOURS,
                reason: 'rainy_day_pause',
                rain24h: latestWeather.rain24h,
              },
              source: 'automation',
            },
          });
        } catch (error) {
          console.error(`Error setting rain delay on device ${device.id}:`, error);
        }
      }
    }

    // Rule 2: Too Wet - Skip
    // If soil_moisture >= 40% → set rain delay 24h
    if (
      latestWeather.soilMoisture !== null &&
      latestWeather.soilMoisture >= SOIL_MOISTURE_HIGH_THRESHOLD_PERCENT
    ) {
      for (const device of devices) {
        try {
          await rachioClient.setRainDelay(device.id, 24); // 24 hours

          results.push({
            rule: 'too_wet_skip',
            triggered: true,
            action: 'set_rain_delay_24h',
            details: {
              deviceId: device.id,
              soilMoisture: latestWeather.soilMoisture,
              threshold: SOIL_MOISTURE_HIGH_THRESHOLD_PERCENT,
            },
          });

          await prisma.auditLog.create({
            data: {
              action: 'set_rain_delay',
              details: {
                deviceId: device.id,
                hours: 24,
                reason: 'too_wet_skip',
                soilMoisture: latestWeather.soilMoisture,
              },
              source: 'automation',
            },
          });
        } catch (error) {
          console.error(`Error setting rain delay on device ${device.id}:`, error);
        }
      }
    }

    // Rule 3: Too Dry - Boost
    // If soil_moisture <= 20% AND rain_24h < 0.1" → run lawn zone 10 min
    if (
      latestWeather.soilMoisture !== null &&
      latestWeather.soilMoisture <= SOIL_MOISTURE_LOW_THRESHOLD_PERCENT &&
      latestWeather.rain24h !== null &&
      latestWeather.rain24h < DRY_RAIN_THRESHOLD_INCHES
    ) {
      const lawnZoneId = await findLawnZone();

      if (lawnZoneId) {
        // Safety check: Don't water if we've watered this zone in the last 24 hours
        const lastWatering = await prisma.wateringEvent.findFirst({
          where: {
            zoneId: lawnZoneId,
            timestamp: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
            },
          },
          orderBy: {
            timestamp: 'desc',
          },
        });

        if (!lastWatering) {
          try {
            const durationSec = DRY_WATERING_DURATION_MINUTES * 60;
            await rachioClient.runZone(lawnZoneId, durationSec);

            results.push({
              rule: 'too_dry_boost',
              triggered: true,
              action: `run_zone_${DRY_WATERING_DURATION_MINUTES}min`,
              details: {
                zoneId: lawnZoneId,
                soilMoisture: latestWeather.soilMoisture,
                rain24h: latestWeather.rain24h,
              },
            });

            // Store watering event
            await prisma.wateringEvent.create({
              data: {
                zoneId: lawnZoneId,
                durationSec,
                source: 'automation',
                rawPayload: {
                  rule: 'too_dry_boost',
                  soilMoisture: latestWeather.soilMoisture,
                  rain24h: latestWeather.rain24h,
                },
              },
            });

            await prisma.auditLog.create({
              data: {
                action: 'run_zone',
                details: {
                  zoneId: lawnZoneId,
                  durationSec,
                  reason: 'too_dry_boost',
                  soilMoisture: latestWeather.soilMoisture,
                  rain24h: latestWeather.rain24h,
                },
                source: 'automation',
              },
            });
          } catch (error) {
            console.error(`Error running zone ${lawnZoneId}:`, error);
          }
        } else {
          console.log(`Skipping watering: zone ${lawnZoneId} was watered recently`);
        }
      } else {
        console.log('No lawn zone found, skipping dry boost rule');
      }
    }

    // Log evaluation results
    if (results.length > 0) {
      console.log('Automation rules evaluated:', results);
    } else {
      console.log('No automation rules triggered');
    }
  } catch (error) {
    console.error('Error evaluating automation rules:', error);

    await prisma.auditLog.create({
      data: {
        action: 'automation_evaluation_error',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        },
        source: 'automation',
      },
    });
  }
}

