import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { RachioClient, RachioRateLimitError, getRachioRateLimitStatus } from '../clients/rachio';
import { pollRachioData } from '../jobs/rachioPoll';

const router = Router();
const prisma = new PrismaClient();

// Helper to handle rate limit errors
function handleRateLimitError(error: unknown, res: Response): boolean {
  if (error instanceof RachioRateLimitError) {
    res.status(429).json({
      error: 'Rachio API rate limit exceeded',
      rateLimitReset: error.resetTime?.toISOString() || null,
      remaining: error.remaining,
      message: error.message,
    });
    return true;
  }
  return false;
}

/**
 * GET /api/rachio/devices
 * Get all Rachio devices
 */
router.get('/devices', async (_req: Request, res: Response) => {
  try {
    const devices = await prisma.rachioDevice.findMany({
      include: {
        zones: true,
      },
    });

    // Enrich zones with data from rawPayload
    const enrichedDevices = devices.map(device => ({
      ...device,
      zones: device.zones.map(zone => {
        const rawPayload = zone.rawPayload as any;
        // Try multiple possible field names for image URL
        const imageUrl = rawPayload?.imageUrl || rawPayload?.image_url || rawPayload?.image || rawPayload?.imageUrlFull || null;
        
        // Helper to extract name from object or return string
        const extractValue = (value: any): string | null => {
          if (!value) return null;
          if (typeof value === 'string') return value;
          if (typeof value === 'object' && value !== null) {
            return value.name || value.label || JSON.stringify(value);
          }
          return String(value);
        };

        return {
          id: zone.id,
          name: zone.name,
          enabled: zone.enabled,
          cooldownPeriodDays: zone.cooldownPeriodDays,
          zoneNumber: rawPayload?.zoneNumber || rawPayload?.zone || null,
          imageUrl,
          area: rawPayload?.area || null,
          rootZoneDepth: rawPayload?.rootZoneDepth || rawPayload?.rootZoneDepthIn || null,
          availableWater: rawPayload?.availableWater || rawPayload?.availableWaterIn || null,
          maxRuntime: rawPayload?.maxRuntime || rawPayload?.maxRuntimeSeconds ? Math.round(rawPayload.maxRuntimeSeconds / 60) : null,
          runtime: rawPayload?.runtime || rawPayload?.runtimeSeconds ? Math.round(rawPayload.runtimeSeconds / 60) : null,
          customNozzle: extractValue(rawPayload?.customNozzle || rawPayload?.nozzle),
          customShade: extractValue(rawPayload?.customShade || rawPayload?.shade),
          customSlope: extractValue(rawPayload?.customSlope || rawPayload?.slope),
          customCrop: extractValue(rawPayload?.customCrop || rawPayload?.crop),
          customSoil: extractValue(rawPayload?.customSoil || rawPayload?.soil),
          rawPayload: zone.rawPayload,
        };
      }),
    }));

    return res.json(enrichedDevices);
  } catch (error) {
    console.error('Error fetching Rachio devices:', error);
    return res.status(500).json({ error: 'Failed to fetch devices' });
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

    return res.json(zones);
  } catch (error) {
    console.error('Error fetching Rachio zones:', error);
    return res.status(500).json({ error: 'Failed to fetch zones' });
  }
});

/**
 * PUT /api/rachio/zones/:zoneId/cooldown
 * Update cooldown period for a zone
 * Body: { cooldownPeriodDays: number | null }
 */
router.put('/zones/:zoneId/cooldown', async (req: Request, res: Response) => {
  try {
    const { zoneId } = req.params;
    const { cooldownPeriodDays } = req.body;

    // Validate cooldownPeriodDays is null or a non-negative integer
    if (cooldownPeriodDays !== null && cooldownPeriodDays !== undefined) {
      if (typeof cooldownPeriodDays !== 'number' || cooldownPeriodDays < 0 || !Number.isInteger(cooldownPeriodDays)) {
        return res.status(400).json({ error: 'cooldownPeriodDays must be null or a non-negative integer' });
      }
    }

    // Check if zone exists
    const zone = await prisma.rachioZone.findUnique({
      where: { id: zoneId },
    });

    if (!zone) {
      return res.status(404).json({ error: 'Zone not found' });
    }

    // Update zone cooldown period
    const updatedZone = await prisma.rachioZone.update({
      where: { id: zoneId },
      data: {
        cooldownPeriodDays: cooldownPeriodDays === null || cooldownPeriodDays === undefined ? null : cooldownPeriodDays,
      },
    });

    return res.json({
      success: true,
      zone: {
        id: updatedZone.id,
        name: updatedZone.name,
        cooldownPeriodDays: updatedZone.cooldownPeriodDays,
      },
    });
  } catch (error) {
    console.error('Error updating zone cooldown period:', error);
    return res.status(500).json({ error: 'Failed to update zone cooldown period' });
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

    // Get latest weather reading for weather stats
    const latestWeather = await prisma.weatherReading.findFirst({
      orderBy: { timestamp: 'desc' },
    });

    // Get device name for audit log
    const device = await prisma.rachioDevice.findUnique({
      where: { id: deviceId },
      select: { name: true },
    });

    // Log to audit log with weather stats
    await prisma.auditLog.create({
      data: {
        action: 'set_rain_delay',
        details: {
          deviceId,
          deviceName: device?.name || null,
          hours,
          source: 'manual',
          completed: true,
          temperature: latestWeather?.temperature ?? null,
          humidity: latestWeather?.humidity ?? null,
          pressure: latestWeather?.pressure ?? null,
          rain24h: latestWeather?.rain24h ?? null,
          rain1h: latestWeather?.rain1h ?? null,
          soilMoisture: latestWeather?.soilMoisture ?? null,
          soilMoistureValues: latestWeather?.soilMoistureValues ?? null,
        },
        source: 'api',
      },
    });

    return res.json({ success: true, message: `Rain delay set for ${hours} hours` });
  } catch (error) {
    console.error('Error setting rain delay:', error);
    return res.status(500).json({ error: 'Failed to set rain delay' });
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

    // Get latest weather reading for weather stats
    const latestWeather = await prisma.weatherReading.findFirst({
      orderBy: { timestamp: 'desc' },
    });

    // Get zone and device info for audit log
    const zone = await prisma.rachioZone.findUnique({
      where: { id: zoneId },
      select: { name: true, device: { select: { id: true, name: true } } },
    });

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

    // Log to audit log with weather stats
    await prisma.auditLog.create({
      data: {
        action: 'run_zone',
        details: {
          zoneId,
          zoneName: zone?.name || null,
          deviceId: zone?.device?.id || null,
          deviceName: zone?.device?.name || null,
          durationSec,
          minutes,
          source: 'manual',
          completed: true,
          temperature: latestWeather?.temperature ?? null,
          humidity: latestWeather?.humidity ?? null,
          pressure: latestWeather?.pressure ?? null,
          rain24h: latestWeather?.rain24h ?? null,
          rain1h: latestWeather?.rain1h ?? null,
          soilMoisture: latestWeather?.soilMoisture ?? null,
          soilMoistureValues: latestWeather?.soilMoistureValues ?? null,
        },
        source: 'api',
      },
    });

    return res.json({ success: true, message: `Zone running for ${minutes} minutes` });
  } catch (error) {
    console.error('Error running zone:', error);
    return res.status(500).json({ error: 'Failed to run zone' });
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

    return res.json({ success: true, message: 'Watering stopped' });
  } catch (error) {
    console.error('Error stopping watering:', error);
    return res.status(500).json({ error: 'Failed to stop watering' });
  }
});

/**
 * GET /api/rachio/watering-events
 * Get recent watering events
 * Query params: limit (default 10)
 * Filters out events with category: undefined or summary containing "Quick Run"
 */
router.get('/watering-events', async (_req: Request, res: Response) => {
  try {
    const limit = parseInt(_req.query.limit as string) || 10;

    const events = await prisma.wateringEvent.findMany({
      take: limit * 2, // Fetch more to account for filtering
      orderBy: {
        timestamp: 'desc',
      },
      include: {
        zone: {
          select: {
            id: true,
            name: true,
            device: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    // Filter out Rachio events with category: undefined or summary containing "Quick Run"
    // Only filter events that have rawPayload (Rachio API events), not manual/automation events
    const filteredEvents = events.filter(event => {
      const rawPayload = event.rawPayload as any;
      
      // If rawPayload exists and looks like a Rachio event (has category field)
      if (rawPayload && typeof rawPayload === 'object' && 'category' in rawPayload) {
        // Exclude events with undefined category
        if (rawPayload.category === undefined) {
          return false;
        }
        
        // Exclude events where summary includes "Quick Run"
        if (rawPayload.summary && typeof rawPayload.summary === 'string') {
          if (rawPayload.summary.toLowerCase().includes('quick run')) {
            return false;
          }
        }
      }
      
      // Include all other events (manual, automation, or Rachio events that pass the filter)
      return true;
    }).slice(0, limit); // Take only the requested limit after filtering

    return res.json(filteredEvents.map(event => ({
      id: event.id,
      timestamp: event.timestamp,
      zoneId: event.zoneId,
      zoneName: event.zone.name,
      deviceId: event.zone.device?.id || null,
      deviceName: event.zone.device?.name || null,
      durationSec: event.durationSec,
      source: event.source,
    })));
  } catch (error) {
    console.error('Error fetching watering events:', error);
    return res.status(500).json({ error: 'Failed to fetch watering events' });
  }
});

/**
 * GET /api/rachio/schedules
 * Get schedules for device(s)
 * Query params: deviceId (optional - if not provided, fetch for all devices)
 */
router.get('/schedules', async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.RACHIO_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Rachio API key not configured' });
    }

    // Check rate limit before attempting any API calls
    const rateLimitStatus = getRachioRateLimitStatus();
    if (rateLimitStatus.rateLimited && rateLimitStatus.resetTime) {
      return res.status(429).json({
        error: 'Rachio API rate limit exceeded',
        rateLimitReset: rateLimitStatus.resetTime.toISOString(),
        remaining: null,
        message: `Rate limit active. Resets at ${rateLimitStatus.resetTime.toISOString()}`,
      });
    }

    const client = new RachioClient(apiKey);
    const deviceId = req.query.deviceId as string | undefined;

    if (deviceId) {
      // Fetch schedules for specific device
      try {
        const schedules = await client.getSchedules(deviceId);
        return res.json(schedules);
      } catch (error) {
        if (handleRateLimitError(error, res)) {
          return;
        }
        throw error;
      }
    } else {
      // Fetch schedules for all devices
      const devices = await prisma.rachioDevice.findMany();
      const allSchedules = [];

      for (const device of devices) {
        try {
          const schedules = await client.getSchedules(device.id);
          allSchedules.push(...schedules);
        } catch (error) {
          // If rate limited, stop trying other devices and return error
          if (error instanceof RachioRateLimitError) {
            // Don't log - this is expected when rate limited
            return res.status(429).json({
              error: 'Rachio API rate limit exceeded',
              rateLimitReset: error.resetTime?.toISOString() || null,
              remaining: error.remaining,
              message: error.message,
              schedules: allSchedules, // Return what we've fetched so far
            });
          }
          console.error(`Error fetching schedules for device ${device.id}:`, error);
          // Continue with other devices even if one fails (non-rate-limit errors)
        }
      }

      return res.json(allSchedules);
    }
  } catch (error) {
    if (handleRateLimitError(error, res)) {
      return;
    }
    console.error('Error fetching schedules:', error);
    return res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

/**
 * PUT /api/rachio/schedules/:id/enable
 * Enable a Rachio schedule
 */
router.put('/schedules/:id/enable', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const apiKey = process.env.RACHIO_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ error: 'Rachio API key not configured' });
    }

    const client = new RachioClient(apiKey);
    await client.enableSchedule(id);

    // Log to audit log
    await prisma.auditLog.create({
      data: {
        action: 'enable_rachio_schedule',
        details: {
          scheduleId: id,
          source: 'api',
        },
        source: 'api',
      },
    });

    return res.json({ success: true, message: 'Schedule enabled' });
  } catch (error) {
    console.error('Error enabling schedule:', error);
    return res.status(500).json({ error: 'Failed to enable schedule' });
  }
});

/**
 * PUT /api/rachio/schedules/:id/start
 * Start a Rachio schedule immediately
 */
router.put('/schedules/:id/start', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const apiKey = process.env.RACHIO_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ error: 'Rachio API key not configured' });
    }

    const client = new RachioClient(apiKey);
    await client.startSchedule(id);

    // Log to audit log
    await prisma.auditLog.create({
      data: {
        action: 'start_rachio_schedule',
        details: {
          scheduleId: id,
          source: 'api',
        },
        source: 'api',
      },
    });

    return res.json({ success: true, message: 'Schedule started' });
  } catch (error) {
    console.error('Error starting schedule:', error);
    return res.status(500).json({ error: 'Failed to start schedule' });
  }
});

/**
 * PUT /api/rachio/schedules/:id/skip
 * Skip the next occurrence of a Rachio schedule
 */
router.put('/schedules/:id/skip', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const apiKey = process.env.RACHIO_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ error: 'Rachio API key not configured' });
    }

    const client = new RachioClient(apiKey);
    await client.skipSchedule(id);

    // Log to audit log
    await prisma.auditLog.create({
      data: {
        action: 'skip_rachio_schedule',
        details: {
          scheduleId: id,
          source: 'api',
        },
        source: 'api',
      },
    });

    return res.json({ success: true, message: 'Schedule skipped' });
  } catch (error) {
    console.error('Error skipping schedule:', error);
    return res.status(500).json({ error: 'Failed to skip schedule' });
  }
});

/**
 * POST /api/rachio/poll
 * Manually trigger a Rachio data poll
 */
router.post('/poll', async (_req: Request, res: Response) => {
  try {
    console.log('Manual Rachio poll triggered via API');
    await pollRachioData();
    return res.json({ success: true, message: 'Rachio data poll completed' });
  } catch (error) {
    if (handleRateLimitError(error, res)) {
      return;
    }
    console.error('Error in manual Rachio poll:', error);
    return res.status(500).json({ 
      error: 'Failed to poll Rachio data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/rachio/devices/:deviceId/current-schedule
 * Get current running schedule for a device
 */
router.get('/devices/:deviceId/current-schedule', async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId required' });
    }

    const apiKey = process.env.RACHIO_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Rachio API key not configured' });
    }

    const client = new RachioClient(apiKey);
    const currentSchedule = await client.getCurrentSchedule(deviceId);

    if (!currentSchedule) {
      return res.json(null);
    }

    return res.json(currentSchedule);
  } catch (error) {
    if (handleRateLimitError(error, res)) {
      return;
    }
    console.error('Error fetching current schedule:', error);
    return res.status(500).json({ error: 'Failed to fetch current schedule' });
  }
});

/**
 * GET /api/rachio/rate-limit-status
 * Get current rate limit status
 */
router.get('/rate-limit-status', async (_req: Request, res: Response) => {
  try {
    // First check if we have a stored rate limit
    const status = getRachioRateLimitStatus();
    if (status.rateLimited && status.resetTime) {
      return res.json({
        rateLimited: true,
        resetTime: status.resetTime.toISOString(),
        remaining: status.remaining,
        limit: status.limit,
        message: `Rate limit active. Resets at ${status.resetTime.toISOString()}`,
      });
    }

    // If not rate limited, try a lightweight API call to get current status
    const apiKey = process.env.RACHIO_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Rachio API key not configured' });
    }

    const client = new RachioClient(apiKey);
    try {
      await client.getPerson();
      // After successful call, check if we have rate limit info from response headers
      const status = getRachioRateLimitStatus();
      return res.json({ 
        rateLimited: false,
        resetTime: null,
        remaining: status.remaining,
        limit: status.limit,
      });
    } catch (error) {
      if (error instanceof RachioRateLimitError) {
        const status = getRachioRateLimitStatus();
        return res.json({
          rateLimited: true,
          resetTime: error.resetTime?.toISOString() || null,
          remaining: error.remaining ?? status.remaining,
          limit: status.limit,
          message: error.message,
        });
      }
      // For other errors, return stored status if available
      const status = getRachioRateLimitStatus();
      return res.json({
        rateLimited: false,
        resetTime: null,
        remaining: status.remaining,
        limit: status.limit,
      });
    }
  } catch (error) {
    console.error('Error checking rate limit status:', error);
    return res.status(500).json({ 
      error: 'Failed to check rate limit status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;

