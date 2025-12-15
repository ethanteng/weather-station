import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import {
  uploadToWeatherUnderground,
  shouldUpload,
} from '../integrations/wunderground';

const router = Router();
const prisma = new PrismaClient();

/**
 * POST /api/integrations/wunderground/test
 * Test endpoint to perform one Weather Underground upload
 */
router.post('/wunderground/test', async (_req: Request, res: Response) => {
  try {
    // Check if WU is enabled
    const enabled = process.env.WU_ENABLED === 'true';
    if (!enabled) {
      return res.status(400).json({
        success: false,
        error: 'Weather Underground is not enabled (WU_ENABLED != true)',
      });
    }

    const stationId = process.env.WU_STATION_ID;
    const apiKey = process.env.WU_API_KEY;

    if (!stationId || !apiKey) {
      return res.status(400).json({
        success: false,
        error: 'WU_STATION_ID and WU_API_KEY must be configured',
      });
    }

    // Fetch latest reading
    const latestReading = await prisma.weatherReading.findFirst({
      orderBy: {
        timestamp: 'desc',
      },
    });

    if (!latestReading) {
      return res.status(404).json({
        success: false,
        error: 'No weather readings available',
      });
    }

    // Check delta (for info, but still upload for test)
    const lastUploadedId = await prisma.auditLog.findFirst({
      where: {
        source: 'wunderground',
        action: 'wu_upload',
      },
      orderBy: {
        timestamp: 'desc',
      },
      select: {
        details: true,
      },
    });

    let lastUploaded = null;
    if (lastUploadedId?.details) {
      const details = lastUploadedId.details as any;
      if (details.readingId) {
        lastUploaded = await prisma.weatherReading.findUnique({
          where: { id: details.readingId },
        });
      }
    }

    const skipped = !shouldUpload(latestReading, lastUploaded);

    // Perform upload
    const result = await uploadToWeatherUnderground(latestReading);

    // Redact sensitive data
    const redactedPayload = result.payload
      ? { ...result.payload, ID: '***', PASSWORD: '***' }
      : undefined;

    return res.json({
      success: result.success,
      skipped,
      payload: redactedPayload,
      wuResponse: result.wuResponse,
      computedFields: result.computedFields,
      error: result.error,
      reading: {
        id: latestReading.id,
        timestamp: latestReading.timestamp.toISOString(),
        temperature: latestReading.temperature,
        humidity: latestReading.humidity,
        pressure: latestReading.pressure,
        rain24h: latestReading.rain24h,
        rain1h: latestReading.rain1h,
      },
    });
  } catch (error) {
    console.error('Error in WU test endpoint:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

