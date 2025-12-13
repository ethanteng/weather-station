import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { RachioClient } from '../clients/rachio';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/rachio/devices
 * Get all Rachio devices
 */
router.get('/devices', async (req: Request, res: Response) => {
  try {
    const devices = await prisma.rachioDevice.findMany({
      include: {
        zones: true,
      },
    });

    res.json(devices);
  } catch (error) {
    console.error('Error fetching Rachio devices:', error);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

/**
 * GET /api/rachio/zones
 * Get zones for a device
 * Query params: deviceId
 */
router.get('/zones', async (req: Request, res: Response) => {
  try {
    const deviceId = req.query.deviceId as string;

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId query parameter required' });
    }

    const zones = await prisma.rachioZone.findMany({
      where: {
        deviceId,
      },
    });

    res.json(zones);
  } catch (error) {
    console.error('Error fetching Rachio zones:', error);
    res.status(500).json({ error: 'Failed to fetch zones' });
  }
});

/**
 * POST /api/rachio/rain-delay
 * Set rain delay on a device
 * Body: { deviceId: string, hours: number }
 */
router.post('/rain-delay', async (req: Request, res: Response) => {
  try {
    const { deviceId, hours } = req.body;

    if (!deviceId || typeof hours !== 'number') {
      return res.status(400).json({ error: 'deviceId and hours (number) required' });
    }

    const apiKey = process.env.RACHIO_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Rachio API key not configured' });
    }

    const client = new RachioClient(apiKey);
    await client.setRainDelay(deviceId, hours);

    // Log to audit log
    await prisma.auditLog.create({
      data: {
        action: 'set_rain_delay',
        details: {
          deviceId,
          hours,
          source: 'manual',
        },
        source: 'api',
      },
    });

    res.json({ success: true, message: `Rain delay set for ${hours} hours` });
  } catch (error) {
    console.error('Error setting rain delay:', error);
    res.status(500).json({ error: 'Failed to set rain delay' });
  }
});

/**
 * POST /api/rachio/zone/run
 * Run a zone for a duration
 * Body: { zoneId: string, minutes: number }
 */
router.post('/zone/run', async (req: Request, res: Response) => {
  try {
    const { zoneId, minutes } = req.body;

    if (!zoneId || typeof minutes !== 'number') {
      return res.status(400).json({ error: 'zoneId and minutes (number) required' });
    }

    const apiKey = process.env.RACHIO_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Rachio API key not configured' });
    }

    const client = new RachioClient(apiKey);
    const durationSec = minutes * 60;
    await client.runZone(zoneId, durationSec);

    // Store watering event
    await prisma.wateringEvent.create({
      data: {
        zoneId,
        durationSec,
        source: 'manual',
        rawPayload: {
          minutes,
          source: 'api',
        },
      },
    });

    // Log to audit log
    await prisma.auditLog.create({
      data: {
        action: 'run_zone',
        details: {
          zoneId,
          durationSec,
          minutes,
          source: 'manual',
        },
        source: 'api',
      },
    });

    res.json({ success: true, message: `Zone running for ${minutes} minutes` });
  } catch (error) {
    console.error('Error running zone:', error);
    res.status(500).json({ error: 'Failed to run zone' });
  }
});

/**
 * POST /api/rachio/stop
 * Stop all watering on a device
 * Body: { deviceId: string }
 */
router.post('/stop', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId required' });
    }

    const apiKey = process.env.RACHIO_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Rachio API key not configured' });
    }

    const client = new RachioClient(apiKey);
    await client.stopWatering(deviceId);

    // Log to audit log
    await prisma.auditLog.create({
      data: {
        action: 'stop_watering',
        details: {
          deviceId,
          source: 'manual',
        },
        source: 'api',
      },
    });

    res.json({ success: true, message: 'Watering stopped' });
  } catch (error) {
    console.error('Error stopping watering:', error);
    res.status(500).json({ error: 'Failed to stop watering' });
  }
});

/**
 * GET /api/rachio/watering-events
 * Get recent watering events
 * Query params: limit (default 10)
 */
router.get('/watering-events', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;

    const events = await prisma.wateringEvent.findMany({
      take: limit,
      orderBy: {
        timestamp: 'desc',
      },
      include: {
        zone: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    res.json(events.map(event => ({
      id: event.id,
      timestamp: event.timestamp,
      zoneId: event.zoneId,
      zoneName: event.zone.name,
      durationSec: event.durationSec,
      source: event.source,
    })));
  } catch (error) {
    console.error('Error fetching watering events:', error);
    res.status(500).json({ error: 'Failed to fetch watering events' });
  }
});

export default router;

