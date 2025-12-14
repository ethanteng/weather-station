import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/sensors
 * Get list of all soil moisture sensors
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const sensors = await prisma.soilMoistureSensor.findMany({
      orderBy: {
        channel: 'asc',
      },
    });

    // Get latest sensor values from weather readings
    const latestReading = await prisma.weatherReading.findFirst({
      orderBy: {
        timestamp: 'desc',
      },
      select: {
        soilMoistureValues: true,
        timestamp: true,
      },
    });

    // Enrich sensors with current values
    const sensorsWithValues = sensors.map(sensor => {
      const channelKey = `soil_ch${sensor.channel}`;
      const currentValue = latestReading?.soilMoistureValues 
        ? (latestReading.soilMoistureValues as Record<string, number>)[channelKey] 
        : null;
      
      return {
        ...sensor,
        currentValue,
        lastReadingAt: latestReading?.timestamp || null,
      };
    });

    res.json(sensorsWithValues);
  } catch (error) {
    console.error('Error fetching sensors:', error);
    res.status(500).json({ error: 'Failed to fetch sensors' });
  }
});

/**
 * GET /api/sensors/:id
 * Get a specific sensor by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const sensor = await prisma.soilMoistureSensor.findUnique({
      where: { id: req.params.id },
    });

    if (!sensor) {
      return res.status(404).json({ error: 'Sensor not found' });
    }

    // Get latest sensor value
    const latestReading = await prisma.weatherReading.findFirst({
      orderBy: {
        timestamp: 'desc',
      },
      select: {
        soilMoistureValues: true,
        timestamp: true,
      },
    });

    const channelKey = `soil_ch${sensor.channel}`;
    const currentValue = latestReading?.soilMoistureValues 
      ? (latestReading.soilMoistureValues as Record<string, number>)[channelKey] 
      : null;

    res.json({
      ...sensor,
      currentValue,
      lastReadingAt: latestReading?.timestamp || null,
    });
  } catch (error) {
    console.error('Error fetching sensor:', error);
    res.status(500).json({ error: 'Failed to fetch sensor' });
  }
});

/**
 * POST /api/sensors
 * Create a new sensor (typically auto-created by weather poll, but allow manual creation)
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { channel, name, enabled } = req.body;

    if (!channel || channel < 1 || channel > 16) {
      return res.status(400).json({ error: 'Channel must be between 1 and 16' });
    }

    // Check if sensor already exists
    const existing = await prisma.soilMoistureSensor.findUnique({
      where: { channel },
    });

    if (existing) {
      return res.status(409).json({ error: 'Sensor with this channel already exists' });
    }

    const sensor = await prisma.soilMoistureSensor.create({
      data: {
        channel,
        name: name || `Soil Sensor ${channel}`,
        enabled: enabled !== undefined ? enabled : true,
      },
    });

    res.status(201).json(sensor);
  } catch (error) {
    console.error('Error creating sensor:', error);
    res.status(500).json({ error: 'Failed to create sensor' });
  }
});

/**
 * PUT /api/sensors/:id
 * Update a sensor (name, enabled status)
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, enabled } = req.body;

    const sensor = await prisma.soilMoistureSensor.findUnique({
      where: { id: req.params.id },
    });

    if (!sensor) {
      return res.status(404).json({ error: 'Sensor not found' });
    }

    const updated = await prisma.soilMoistureSensor.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(enabled !== undefined && { enabled }),
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Error updating sensor:', error);
    res.status(500).json({ error: 'Failed to update sensor' });
  }
});

/**
 * DELETE /api/sensors/:id
 * Delete a sensor (soft delete by disabling)
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const sensor = await prisma.soilMoistureSensor.findUnique({
      where: { id: req.params.id },
    });

    if (!sensor) {
      return res.status(404).json({ error: 'Sensor not found' });
    }

    // Soft delete by disabling
    await prisma.soilMoistureSensor.update({
      where: { id: req.params.id },
      data: { enabled: false },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting sensor:', error);
    res.status(500).json({ error: 'Failed to delete sensor' });
  }
});

export default router;
