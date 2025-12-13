import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { evaluateRules } from '../automation/engine';
import { RachioClient } from '../clients/rachio';

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
              interval: schedule.interval,
              startTime: schedule.startTime,
              startDate: schedule.startDate,
              endDate: schedule.endDate,
              cycleSoak: schedule.cycleSoak,
              weatherIntelligence: schedule.weatherIntelligence,
              color: schedule.color,
              repeat: schedule.repeat,
            }));
            rachioSchedules.push(...transformedSchedules);
          } catch (error) {
            console.error(`Error fetching schedules for device ${device.id}:`, error);
            // Continue with other devices even if one fails
          }
        }
      } catch (error) {
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

    return res.json(allRules);
  } catch (error) {
    console.error('Error fetching automations:', error);
    return res.status(500).json({ error: 'Failed to fetch automations' });
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
 * POST /api/automations
 * Create a new automation rule
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, enabled = true, conditions, actions } = req.body;

    if (!name || !conditions || !actions) {
      return res.status(400).json({ error: 'Missing required fields: name, conditions, actions' });
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
    if (conditions !== undefined) updateData.conditions = conditions as object;
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

