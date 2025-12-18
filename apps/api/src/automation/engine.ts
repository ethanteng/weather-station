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
  operator: '>=' | '<=' | '>' | '<' | '==' | 'trend';
  value?: number; // Optional when operator is 'trend'
  trend?: 'increasing' | 'decreasing'; // Required when operator is 'trend'
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
  pressure?: Condition;
}

interface Actions {
  type: 'set_rain_delay' | 'run_zone';
  hours?: number;
  minutes?: number;
  zoneIds?: string[]; // Array of zone IDs for run_zone action
  deviceIds?: string[]; // Array of device IDs for set_rain_delay action (optional - defaults to all devices)
}

/**
 * Calculate linear regression slope from historical data points
 * Returns the slope (positive = increasing, negative = decreasing)
 */
function calculateTrendSlope(
  dataPoints: Array<{ timestamp: Date; value: number }>
): number | null {
  if (dataPoints.length < 2) {
    return null;
  }

  // Sort by timestamp to ensure chronological order
  const sorted = [...dataPoints].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  
  const n = sorted.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  // Use timestamp as x (in milliseconds since epoch) and value as y
  sorted.forEach((point) => {
    const x = point.timestamp.getTime();
    const y = point.value;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  });

  // Calculate slope: (n*ΣXY - ΣX*ΣY) / (n*ΣX² - (ΣX)²)
  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) {
    return null;
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  return slope;
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
    pressure: number | null;
  },
  historicalData?: Array<{ timestamp: Date; value: number }>
): boolean {
  // Handle trend operator
  if (condition.operator === 'trend') {
    if (!condition.trend || !historicalData || historicalData.length < 2) {
      return false;
    }

    const slope = calculateTrendSlope(historicalData);
    if (slope === null) {
      return false;
    }

    if (condition.trend === 'increasing') {
      return slope > 0;
    } else if (condition.trend === 'decreasing') {
      return slope < 0;
    }
    return false;
  }

  // Handle numeric operators
  const value = weather[field];
  if (value === null || value === undefined || condition.value === undefined) {
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
    pressure: number | null;
  },
  soilMoistureValues?: Record<string, number> | null,
  historicalData?: {
    temperature?: Array<{ timestamp: Date; value: number }>;
    humidity?: Array<{ timestamp: Date; value: number }>;
    pressure?: Array<{ timestamp: Date; value: number }>;
  }
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
      const fieldKey = field as keyof Conditions;
      const conditionData = condition as Condition;
      
      // Get historical data for trend evaluation if needed
      // Note: trend conditions are only supported for temperature, humidity, and pressure
      let fieldHistoricalData: Array<{ timestamp: Date; value: number }> | undefined;
      if (conditionData.operator === 'trend' && historicalData) {
        if (fieldKey === 'temperature' && historicalData.temperature) {
          fieldHistoricalData = historicalData.temperature;
        } else if (fieldKey === 'humidity' && historicalData.humidity) {
          fieldHistoricalData = historicalData.humidity;
        } else if (fieldKey === 'pressure' && historicalData.pressure) {
          fieldHistoricalData = historicalData.pressure;
        }
      }
      
      if (!evaluateCondition(fieldKey, conditionData, weather, fieldHistoricalData)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Check if a zone is currently in cooldown period
 * Compares last watering date at day level (not hour/minute level)
 * Returns true if zone is still in cooldown, false otherwise
 */
export async function isZoneInCooldown(zoneId: string, cooldownDays: number): Promise<boolean> {
  if (cooldownDays <= 0) {
    return false; // No cooldown or invalid cooldown period
  }

  // Get the last watering event for this zone
  const lastWatering = await prisma.wateringEvent.findFirst({
    where: {
      zoneId: zoneId,
    },
    orderBy: {
      timestamp: 'desc',
    },
  });

  // If no previous watering, zone is not in cooldown
  if (!lastWatering) {
    return false;
  }

  // Calculate days since last watering (day-level comparison)
  // Use UTC methods since database timestamps are stored in UTC (Timestamptz)
  const today = new Date();
  const lastWateringDate = new Date(lastWatering.timestamp);
  
  // Set both dates to midnight UTC for day-level comparison
  const todayMidnight = new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  ));
  const lastWateringMidnight = new Date(Date.UTC(
    lastWateringDate.getUTCFullYear(),
    lastWateringDate.getUTCMonth(),
    lastWateringDate.getUTCDate()
  ));

  // Calculate difference in days
  const daysSinceWatering = Math.floor(
    (todayMidnight.getTime() - lastWateringMidnight.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Zone is in cooldown if days since watering is less than cooldown period
  return daysSinceWatering < cooldownDays;
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
    rain1h: number | null;
    temperature: number | null;
    humidity: number | null;
    pressure: number | null;
  },
  _soilMoistureValues?: Record<string, number> | null,
  ruleId?: string,
  ruleName?: string
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

    // Filter devices if deviceIds is specified, otherwise use all devices
    const targetDevices = actions.deviceIds && actions.deviceIds.length > 0
      ? devices.filter(device => actions.deviceIds!.includes(device.id))
      : devices;

    if (targetDevices.length === 0) {
      console.log('No matching devices found for set_rain_delay action');
      return null;
    }

    const successfulDeviceIds: string[] = [];
    const failedDeviceIds: string[] = [];

    for (const device of targetDevices) {
      try {
        await rachioClient.setRainDelay(device.id, actions.hours);

        // Get latest weather reading for complete weather stats
        const latestWeather = await prisma.weatherReading.findFirst({
          orderBy: { timestamp: 'desc' },
        });

        // Get device name for audit log
        const deviceRecord = await prisma.rachioDevice.findUnique({
          where: { id: device.id },
          select: { name: true },
        });

        await prisma.auditLog.create({
          data: {
            action: 'set_rain_delay',
            details: {
              deviceId: device.id,
              deviceName: deviceRecord?.name || null,
              hours: actions.hours,
              ruleId: ruleId || null,
              ruleName: ruleName || null,
              completed: true,
              temperature: latestWeather?.temperature ?? null,
              humidity: latestWeather?.humidity ?? null,
              pressure: latestWeather?.pressure ?? null,
              rain24h: latestWeather?.rain24h ?? null,
              rain1h: latestWeather?.rain1h ?? null,
              soilMoisture: latestWeather?.soilMoisture ?? null,
              soilMoistureValues: latestWeather?.soilMoistureValues ?? null,
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
        deviceCount: targetDevices.length,
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
    const skippedZoneIds: string[] = [];

    // First, check cooldown periods for all zones and separate them
    const zonesToRun: Array<{ zoneId: string; zoneName: string }> = [];
    
    for (const zoneId of zoneIds) {
      // Fetch zone's cooldown period from database
      const zone = await prisma.rachioZone.findUnique({
        where: { id: zoneId },
        select: { cooldownPeriodDays: true, name: true },
      });

      // Check cooldown period if configured
      if (zone && zone.cooldownPeriodDays !== null && zone.cooldownPeriodDays !== undefined && zone.cooldownPeriodDays > 0) {
        const inCooldown = await isZoneInCooldown(zoneId, zone.cooldownPeriodDays);
        if (inCooldown) {
          console.log(`Skipping watering: zone ${zone.name || zoneId} is in cooldown period (${zone.cooldownPeriodDays} days)`);
          skippedZoneIds.push(zoneId);
          continue;
        }
      }

      zonesToRun.push({
        zoneId,
        zoneName: zone?.name || zoneId,
      });
    }

    if (zonesToRun.length === 0) {
      console.log('All zones are in cooldown period, skipping run_zone action');
      return {
        triggered: true,
        action: `run_zone_${actions.minutes}min`,
        details: {
          minutes: actions.minutes,
          zoneIds: [],
          failedZoneIds: [],
          skippedZoneIds,
          durationSec,
          soilMoisture: weather.soilMoisture,
          rain24h: weather.rain24h,
          zones: [],
        },
      };
    }

    // Get latest weather reading for complete weather stats (fetch once for all zones)
    const latestWeather = await prisma.weatherReading.findFirst({
      orderBy: { timestamp: 'desc' },
    });

    // Use /start_multiple endpoint if there are multiple zones, otherwise use /start
    // Note: Zones run sequentially (one at a time), not simultaneously
    if (zonesToRun.length > 1) {
      try {
        // Prepare zone run durations with sequential sortOrder (1, 2, 3, ...)
        // Duration is already in seconds (durationSec = minutes * 60)
        const zoneRunDurations = zonesToRun.map((zone, index) => ({
          zoneId: zone.zoneId,
          duration: durationSec, // Duration in seconds
          sortOrder: index + 1, // Sequential order: 1, 2, 3, ...
        }));

        await rachioClient.runZones(zoneRunDurations);

        // Get zone and device info for audit logs
        const zoneInfos = await prisma.rachioZone.findMany({
          where: { id: { in: zonesToRun.map(z => z.zoneId) } },
          select: { id: true, name: true, device: { select: { id: true, name: true } } },
        });

        // Create watering events and audit logs for each zone
        for (const zoneInfo of zoneInfos) {
          await prisma.wateringEvent.create({
            data: {
              zoneId: zoneInfo.id,
              durationSec,
              source: 'automation',
              rawPayload: {
                soilMoisture: weather.soilMoisture,
                rain24h: weather.rain24h,
                ruleId: ruleId || null,
                ruleName: ruleName || null,
              },
            },
          });

          await prisma.auditLog.create({
            data: {
              action: 'run_zone',
              details: {
                zoneId: zoneInfo.id,
                zoneName: zoneInfo.name || null,
                deviceId: zoneInfo.device?.id || null,
                deviceName: zoneInfo.device?.name || null,
                durationSec,
                minutes: Math.round(durationSec / 60),
                ruleId: ruleId || null,
                ruleName: ruleName || null,
                completed: true,
                temperature: latestWeather?.temperature ?? null,
                humidity: latestWeather?.humidity ?? null,
                pressure: latestWeather?.pressure ?? null,
                rain24h: latestWeather?.rain24h ?? null,
                rain1h: latestWeather?.rain1h ?? null,
                soilMoisture: latestWeather?.soilMoisture ?? null,
                soilMoistureValues: latestWeather?.soilMoistureValues ?? null,
              },
              source: 'automation',
            },
          });
        }

        successfulZoneIds.push(...zonesToRun.map(z => z.zoneId));
      } catch (error) {
        console.error(`Error running multiple zones:`, error);
        failedZoneIds.push(...zonesToRun.map(z => z.zoneId));
      }
    } else {
      // Single zone - use the original /start endpoint
      const zoneId = zonesToRun[0].zoneId;
      try {
        await rachioClient.runZone(zoneId, durationSec);

        // Get zone and device info for audit log
        const zoneInfo = await prisma.rachioZone.findUnique({
          where: { id: zoneId },
          select: { name: true, device: { select: { id: true, name: true } } },
        });

        await prisma.wateringEvent.create({
          data: {
            zoneId: zoneId,
            durationSec,
            source: 'automation',
            rawPayload: {
              soilMoisture: weather.soilMoisture,
              rain24h: weather.rain24h,
              ruleId: ruleId || null,
              ruleName: ruleName || null,
            },
          },
        });

        await prisma.auditLog.create({
          data: {
            action: 'run_zone',
            details: {
              zoneId: zoneId,
              zoneName: zoneInfo?.name || null,
              deviceId: zoneInfo?.device?.id || null,
              deviceName: zoneInfo?.device?.name || null,
              durationSec,
              minutes: Math.round(durationSec / 60),
              ruleId: ruleId || null,
              ruleName: ruleName || null,
              completed: true,
              temperature: latestWeather?.temperature ?? null,
              humidity: latestWeather?.humidity ?? null,
              pressure: latestWeather?.pressure ?? null,
              rain24h: latestWeather?.rain24h ?? null,
              rain1h: latestWeather?.rain1h ?? null,
              soilMoisture: latestWeather?.soilMoisture ?? null,
              soilMoistureValues: latestWeather?.soilMoistureValues ?? null,
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

    // Get zone names for successful zones
    const successfulZones = successfulZoneIds.length > 0
      ? await prisma.rachioZone.findMany({
          where: { id: { in: successfulZoneIds } },
          select: { id: true, name: true, device: { select: { id: true, name: true } } },
        })
      : [];

    return {
      triggered: true,
      action: `run_zone_${actions.minutes}min`,
      details: {
        minutes: actions.minutes,
        zoneIds: successfulZoneIds,
        failedZoneIds,
        skippedZoneIds,
        durationSec,
        soilMoisture: weather.soilMoisture,
        rain24h: weather.rain24h,
        zones: successfulZones.map(z => ({
          zoneId: z.id,
          zoneName: z.name,
          deviceId: z.device?.id || null,
          deviceName: z.device?.name || null,
        })),
      },
    };
  }

  return null;
}

/**
 * Evaluate all automation rules from database
 * Runs twice daily (8 AM and 8 PM) via cron job
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

    // Prepare weather data for condition evaluation and action execution
    const weather = {
      rain24h: latestWeather.rain24h,
      soilMoisture: latestWeather.soilMoisture,
      rain1h: latestWeather.rain1h,
      temperature: latestWeather.temperature,
      humidity: latestWeather.humidity,
      pressure: latestWeather.pressure,
    };

    // Extract soil moisture values from JSON field
    const soilMoistureValues = latestWeather.soilMoistureValues 
      ? (latestWeather.soilMoistureValues as Record<string, number>)
      : null;

    // Check if any rule uses trend conditions - if so, fetch historical data
    // Note: trend conditions are only available for temperature, humidity, and pressure
    const needsHistoricalData = rules.some(rule => {
      const conditions = rule.conditions as unknown as Conditions;
      return (
        (conditions.temperature && (conditions.temperature as Condition).operator === 'trend') ||
        (conditions.humidity && (conditions.humidity as Condition).operator === 'trend') ||
        (conditions.pressure && (conditions.pressure as Condition).operator === 'trend')
      );
    });

    let historicalData: {
      temperature?: Array<{ timestamp: Date; value: number }>;
      humidity?: Array<{ timestamp: Date; value: number }>;
      pressure?: Array<{ timestamp: Date; value: number }>;
    } | undefined;

    if (needsHistoricalData) {
      // Fetch last 7 days of weather readings
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const historicalReadings = await prisma.weatherReading.findMany({
        where: {
          timestamp: {
            gte: sevenDaysAgo,
          },
        },
        orderBy: {
          timestamp: 'asc',
        },
      });

      // Extract data points for each field (only temperature, humidity, and pressure support trends)
      historicalData = {
        temperature: historicalReadings
          .filter(r => r.temperature !== null)
          .map(r => ({ timestamp: r.timestamp, value: r.temperature! })),
        humidity: historicalReadings
          .filter(r => r.humidity !== null)
          .map(r => ({ timestamp: r.timestamp, value: r.humidity! })),
        pressure: historicalReadings
          .filter(r => r.pressure !== null)
          .map(r => ({ timestamp: r.timestamp, value: r.pressure! })),
      };
    }

    // Evaluate each rule
    for (const rule of rules) {
      try {
        const conditions = rule.conditions as unknown as Conditions;
        const actions = rule.actions as unknown as Actions;

        // Check if conditions are met
        if (evaluateConditions(conditions, weather, soilMoistureValues, historicalData)) {
          // Execute the action
          const result = await executeAction(actions, devices, rachioClient, weather, soilMoistureValues as Record<string, number> | null, rule.id, rule.name);

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

            // Create summary audit log entry for the triggered automation
            await prisma.auditLog.create({
              data: {
                action: 'automation_triggered',
                details: {
                  ruleId: rule.id,
                  ruleName: rule.name,
                  action: result.action,
                  completed: true,
                  temperature: latestWeather.temperature,
                  humidity: latestWeather.humidity,
                  pressure: latestWeather.pressure,
                  rain24h: latestWeather.rain24h,
                  rain1h: latestWeather.rain1h,
                  soilMoisture: latestWeather.soilMoisture,
                  soilMoistureValues: latestWeather.soilMoistureValues,
                  resultDetails: result.details as any,
                },
                source: 'automation',
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
