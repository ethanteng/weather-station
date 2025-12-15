import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { evaluateRules } from '../automation/engine';
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

    // Get total count of matching records for pagination
    const total = await prisma.auditLog.count({
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
        ],
      },
    });

    // Query audit log for automation and schedule runs
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
        ],
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: limit,
      skip: offset,
    });

    // Transform audit logs to history entries
    const history = auditLogs.map(log => {
      const details = log.details as any;
      
      // Determine type and extract relevant information
      const isSchedule = log.source === 'rachio_schedule';
      const isAutomation = log.source === 'automation';
      
      return {
        id: log.id,
        timestamp: log.timestamp,
        type: isSchedule ? 'schedule' : 'automation',
        action: log.action,
        name: details.ruleName || details.scheduleName || 'Unknown',
        ruleId: details.ruleId || null,
        scheduleId: details.scheduleId || null,
        deviceId: details.deviceId || null,
        deviceName: details.deviceName || null,
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
          minutes: details.minutes || null,
          zoneIds: details.zoneIds || [],
          deviceIds: details.successfulDeviceIds || [],
          resultDetails: details.resultDetails || null,
        },
      };
    });

    return res.json({
      entries: history,
      total,
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

export default router;

