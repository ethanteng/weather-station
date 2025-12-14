import { PrismaClient } from '@prisma/client';
import { RachioClient } from '../clients/rachio';
import { findLawnZone } from './zoneFinder';

const prisma = new PrismaClient();

interface AutomationResult {
  ruleId?: string;
  ruleName?: string;
  triggered: boolean;
  action?: string;
  details?: Record<string, unknown>;
}

interface Condition {
  operator: '>=' | '<=' | '>' | '<' | '==';
  value: number;
}

interface SoilMoistureSensorCondition {
  channel: number; // 1-16
  operator: '>=' | '<=' | '>' | '<' | '==';
  value: number;
}

interface SoilMoistureCondition {
  sensors: SoilMoistureSensorCondition[];
  logic?: 'AND' | 'OR'; // Default: AND (all sensors must meet condition)
}

interface Conditions {
  rain24h?: Condition;
  soilMoisture?: Condition | SoilMoistureCondition; // Support both old format (single sensor) and new format (multiple sensors)
  rain1h?: Condition;
  temperature?: Condition;
  humidity?: Condition;
}

interface Actions {
  type: 'set_rain_delay' | 'run_zone';
  hours?: number;
  minutes?: number;
  zoneIds?: string[]; // Array of zone IDs for run_zone action
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
 * Evaluate soil moisture sensor conditions
 */
function evaluateSoilMoistureCondition(
  condition: SoilMoistureCondition,
  soilMoistureValues: Record<string, number> | null
): boolean {
  if (!soilMoistureValues || condition.sensors.length === 0) {
    return false;
  }

  const logic = condition.logic || 'AND';
  const results: boolean[] = [];

  for (const sensorCondition of condition.sensors) {
    const channelKey = `soil_ch${sensorCondition.channel}`;
    const sensorValue = soilMoistureValues[channelKey];

    if (sensorValue === undefined || sensorValue === null) {
      results.push(false);
      continue;
    }

    let result = false;
    switch (sensorCondition.operator) {
      case '>=':
        result = sensorValue >= sensorCondition.value;
        break;
      case '<=':
        result = sensorValue <= sensorCondition.value;
        break;
      case '>':
        result = sensorValue > sensorCondition.value;
        break;
      case '<':
        result = sensorValue < sensorCondition.value;
        break;
      case '==':
        result = sensorValue === sensorCondition.value;
        break;
    }
    results.push(result);
  }

  // Apply logic operator
  if (logic === 'OR') {
    return results.some(r => r === true);
  } else {
    // AND logic (default)
    return results.every(r => r === true);
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
  },
  soilMoistureValues?: Record<string, number> | null
): boolean {
  // All conditions must be true (AND logic)
  for (const [field, condition] of Object.entries(conditions)) {
    // Special handling for soilMoisture condition (can be old or new format)
    if (field === 'soilMoisture') {
      // Check if it's the new format (has sensors array)
      if (condition && typeof condition === 'object' && 'sensors' in condition) {
        const sensorCondition = condition as SoilMoistureCondition;
        if (!evaluateSoilMoistureCondition(sensorCondition, soilMoistureValues || null)) {
          return false;
        }
      } else {
        // Old format: single sensor condition (backward compatibility)
        const oldCondition = condition as Condition;
        if (!evaluateCondition('soilMoisture', oldCondition, weather)) {
          return false;
        }
      }
    } else {
      // Regular condition evaluation
      if (!evaluateCondition(field as keyof Conditions, condition as Condition, weather)) {
        return false;
      }
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

    if (devices.length === 0) {
      console.log('No Rachio devices found, skipping set_rain_delay action');
      return null;
    }

    const successfulDeviceIds: string[] = [];
    const failedDeviceIds: string[] = [];

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

        successfulDeviceIds.push(device.id);
      } catch (error) {
        console.error(`Error setting rain delay on device ${device.id}:`, error);
        failedDeviceIds.push(device.id);
      }
    }

    // Only return success if at least one device was updated
    if (successfulDeviceIds.length === 0) {
      console.log('Failed to set rain delay on all devices');
      return null;
    }

    return {
      triggered: true,
      action: `set_rain_delay_${actions.hours}h`,
      details: {
        hours: actions.hours,
        successfulDeviceIds,
        failedDeviceIds,
        deviceCount: devices.length,
      },
    };
  }

  if (actions.type === 'run_zone') {
    if (!actions.minutes) {
      console.error('run_zone action missing minutes');
      return null;
    }

    // Get zones to run - use zoneIds if specified, otherwise fall back to findLawnZone for backward compatibility
    let zoneIds: string[] = [];
    
    if (actions.zoneIds && actions.zoneIds.length > 0) {
      // Use specified zone IDs
      zoneIds = actions.zoneIds;
    } else {
      // Fallback to finding lawn zone for backward compatibility
      const lawnZoneId = await findLawnZone();
      if (!lawnZoneId) {
        console.log('No zones specified and no lawn zone found, skipping run_zone action');
        return null;
      }
      zoneIds = [lawnZoneId];
    }

    if (zoneIds.length === 0) {
      console.log('No zones specified for run_zone action');
      return null;
    }

    const durationSec = actions.minutes * 60;
    const successfulZoneIds: string[] = [];
    const failedZoneIds: string[] = [];

    // Run each zone
    for (const zoneId of zoneIds) {
      // Safety check: Don't water if we've watered this zone in the last 24 hours
      const lastWatering = await prisma.wateringEvent.findFirst({
        where: {
          zoneId: zoneId,
          timestamp: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
        orderBy: {
          timestamp: 'desc',
        },
      });

      if (lastWatering) {
        console.log(`Skipping watering: zone ${zoneId} was watered recently`);
        continue;
      }

      try {
        await rachioClient.runZone(zoneId, durationSec);

        await prisma.wateringEvent.create({
          data: {
            zoneId: zoneId,
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
              zoneId: zoneId,
              durationSec,
              soilMoisture: weather.soilMoisture,
              rain24h: weather.rain24h,
            },
            source: 'automation',
          },
        });

        successfulZoneIds.push(zoneId);
      } catch (error) {
        console.error(`Error running zone ${zoneId}:`, error);
        failedZoneIds.push(zoneId);
      }
    }

    if (successfulZoneIds.length === 0) {
      console.log('No zones were successfully watered');
      return null;
    }

    return {
      triggered: true,
      action: `run_zone_${actions.minutes}min`,
      details: {
        zoneIds: successfulZoneIds,
        failedZoneIds,
        durationSec,
        soilMoisture: weather.soilMoisture,
        rain24h: weather.rain24h,
      },
    };
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

    // Extract soil moisture values from JSON field
    const soilMoistureValues = latestWeather.soilMoistureValues 
      ? (latestWeather.soilMoistureValues as Record<string, number>)
      : null;

    // Evaluate each rule
    for (const rule of rules) {
      try {
        const conditions = rule.conditions as unknown as Conditions;
        const actions = rule.actions as unknown as Actions;

        // Check if conditions are met
        if (evaluateConditions(conditions, weather, soilMoistureValues)) {
          // Execute the action
          const result = await executeAction(actions, devices, rachioClient, weather);

          if (result) {
            results.push({
              ...result,
              ruleId: rule.id,
              ruleName: rule.name,
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
