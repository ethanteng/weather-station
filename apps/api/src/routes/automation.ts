import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { evaluateRules } from '../automation/engine';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/automations
 * Get list of all automation rules
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const rules = await prisma.automationRule.findMany({
      orderBy: {
        createdAt: 'asc',
      },
    });

    return res.json(rules);
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

