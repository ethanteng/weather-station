import { PrismaClient } from '@prisma/client';
import { RachioClient } from '../clients/rachio';
import { findLawnZone } from './zoneFinder';

const prisma = new PrismaClient();

interface AutomationResult {
  ruleId: string;
  ruleName: string;
  triggered: boolean;
  action?: string;
  details?: Record<string, unknown>;
}

interface Condition {
  operator: '>=' | '<=' | '>' | '<' | '==';
  value: number;
}

interface Conditions {
  rain24h?: Condition;
  soilMoisture?: Condition;
  rain1h?: Condition;
  temperature?: Condition;
  humidity?: Condition;
}

interface Actions {
  type: 'set_rain_delay' | 'run_zone';
  hours?: number;
  minutes?: number;
}

/**
 * Evaluate a single condition against weather data
 */
function evaluateCondition(
  field: keyof Conditions,
  condition: Condition,
  weather: {
    rain24h: number | null;
    soilMoisture: number | null;
    rain1h: number | null;
    temperature: number | null;
    humidity: number | null;
  }
): boolean {
  const value = weather[field];
  if (value === null || value === undefined) {
    return false;
  }

  switch (condition.operator) {
    case '>=':
      return value >= condition.value;
    case '<=':
      return value <= condition.value;
    case '>':
      return value > condition.value;
    case '<':
      return value < condition.value;
    case '==':
      return value === condition.value;
    default:
      return false;
  }
}

/**
 * Evaluate all conditions for a rule
 */
function evaluateConditions(
  conditions: Conditions,
  weather: {
    rain24h: number | null;
    soilMoisture: number | null;
    rain1h: number | null;
    temperature: number | null;
    humidity: number | null;
  }
): boolean {
  // All conditions must be true (AND logic)
  for (const [field, condition] of Object.entries(conditions)) {
    if (!evaluateCondition(field as keyof Conditions, condition as Condition, weather)) {
      return false;
    }
  }
  return true;
}

/**
 * Execute an action based on the rule's actions configuration
 */
async function executeAction(
  actions: Actions,
  devices: { id: string }[],
  rachioClient: RachioClient,
  weather: {
    rain24h: number | null;
    soilMoisture: number | null;
  }
): Promise<AutomationResult | null> {
  if (actions.type === 'set_rain_delay') {
    if (!actions.hours) {
      console.error('set_rain_delay action missing hours');
      return null;
    }

    for (const device of devices) {
      try {
        await rachioClient.setRainDelay(device.id, actions.hours);

        await prisma.auditLog.create({
          data: {
            action: 'set_rain_delay',
            details: {
              deviceId: device.id,
              hours: actions.hours,
            },
            source: 'automation',
          },
        });
      } catch (error) {
        console.error(`Error setting rain delay on device ${device.id}:`, error);
      }
    }

    return {
      ruleId: '',
      ruleName: '',
      triggered: true,
      action: `set_rain_delay_${actions.hours}h`,
      details: {
        hours: actions.hours,
        deviceCount: devices.length,
      },
    };
  }

  if (actions.type === 'run_zone') {
    if (!actions.minutes) {
      console.error('run_zone action missing minutes');
      return null;
    }

    const lawnZoneId = await findLawnZone();
    if (!lawnZoneId) {
      console.log('No lawn zone found, skipping run_zone action');
      return null;
    }

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

    if (lastWatering) {
      console.log(`Skipping watering: zone ${lawnZoneId} was watered recently`);
      return null;
    }

    try {
      const durationSec = actions.minutes * 60;
      await rachioClient.runZone(lawnZoneId, durationSec);

      await prisma.wateringEvent.create({
        data: {
          zoneId: lawnZoneId,
          durationSec,
          source: 'automation',
          rawPayload: {
            soilMoisture: weather.soilMoisture,
            rain24h: weather.rain24h,
          },
        },
      });

      await prisma.auditLog.create({
        data: {
          action: 'run_zone',
          details: {
            zoneId: lawnZoneId,
            durationSec,
            soilMoisture: weather.soilMoisture,
            rain24h: weather.rain24h,
          },
          source: 'automation',
        },
      });

      return {
        ruleId: '',
        ruleName: '',
        triggered: true,
        action: `run_zone_${actions.minutes}min`,
        details: {
          zoneId: lawnZoneId,
          durationSec,
          soilMoisture: weather.soilMoisture,
          rain24h: weather.rain24h,
        },
      };
    } catch (error) {
      console.error(`Error running zone ${lawnZoneId}:`, error);
      return null;
    }
  }

  return null;
}

/**
 * Evaluate all automation rules from database
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

    // Get all enabled automation rules
    const rules = await prisma.automationRule.findMany({
      where: {
        enabled: true,
      },
    });

    if (rules.length === 0) {
      console.log('No enabled automation rules found');
      return;
    }

    const results: AutomationResult[] = [];

    // Prepare weather data for condition evaluation
    const weather = {
      rain24h: latestWeather.rain24h,
      soilMoisture: latestWeather.soilMoisture,
      rain1h: latestWeather.rain1h,
      temperature: latestWeather.temperature,
      humidity: latestWeather.humidity,
    };

    // Evaluate each rule
    for (const rule of rules) {
      try {
        const conditions = rule.conditions as Conditions;
        const actions = rule.actions as Actions;

        // Check if conditions are met
        if (evaluateConditions(conditions, weather)) {
          // Execute the action
          const result = await executeAction(actions, devices, rachioClient, weather);

          if (result) {
            results.push({
              ruleId: rule.id,
              ruleName: rule.name,
              ...result,
            });

            // Update rule's last run info
            await prisma.automationRule.update({
              where: { id: rule.id },
              data: {
                lastRunAt: new Date(),
                lastResult: JSON.stringify(result),
              },
            });
          }
        }
      } catch (error) {
        console.error(`Error evaluating rule ${rule.id} (${rule.name}):`, error);
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
