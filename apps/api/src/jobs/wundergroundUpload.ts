import { PrismaClient } from '@prisma/client';
import {
  uploadToWeatherUnderground,
  shouldUpload,
  WUUploadResult,
} from '../integrations/wunderground';

const prisma = new PrismaClient();

// Track last uploaded reading to prevent duplicate uploads
const lastUploadedReadingId = new Map<string, string>();
let uploadInProgress = false;

/**
 * Upload weather data to Weather Underground
 * Runs as a scheduled background job
 */
export async function uploadWeatherUnderground(): Promise<void> {
  // Check if WU is enabled
  const enabled = process.env.WU_ENABLED === 'true';
  if (!enabled) {
    return; // Silently skip if not enabled
  }

  const stationId = process.env.WU_STATION_ID;
  const apiKey = process.env.WU_API_KEY;

  if (!stationId || !apiKey) {
    console.log('Weather Underground: Not configured (missing WU_STATION_ID or WU_API_KEY)');
    return;
  }

  // Prevent overlapping runs
  if (uploadInProgress) {
    console.log('Weather Underground: Upload already in progress, skipping');
    return;
  }

  uploadInProgress = true;

  try {
    // Fetch latest reading
    const latestReading = await prisma.weatherReading.findFirst({
      orderBy: {
        timestamp: 'desc',
      },
    });

    if (!latestReading) {
      console.log('Weather Underground: No weather readings available');
      return;
    }

    // Check if we should upload (delta check)
    const lastUploadedId = lastUploadedReadingId.get(stationId);
    let lastUploaded: typeof latestReading | null = null;

    if (lastUploadedId) {
      lastUploaded = await prisma.weatherReading.findUnique({
        where: { id: lastUploadedId },
      });
    }

    if (!shouldUpload(latestReading, lastUploaded)) {
      console.log('Weather Underground: No material change since last upload, skipping');
      
      // Log skipped upload to audit log
      await prisma.auditLog.create({
        data: {
          action: 'wu_upload_skipped',
          source: 'wunderground',
          details: {
            reason: 'No material change detected',
            readingId: latestReading.id,
            timestamp: latestReading.timestamp.toISOString(),
            temperature: latestReading.temperature,
            humidity: latestReading.humidity,
            pressure: latestReading.pressure,
            rain24h: latestReading.rain24h,
          },
        },
      });
      
      return;
    }

    // Perform upload
    console.log('Weather Underground: Uploading weather data...');
    const result: WUUploadResult = await uploadToWeatherUnderground(latestReading);

    // Log to audit log
    const auditDetails: any = {
      readingId: latestReading.id,
      timestamp: latestReading.timestamp.toISOString(),
      temperature: latestReading.temperature,
      humidity: latestReading.humidity,
      pressure: latestReading.pressure,
      rain24h: latestReading.rain24h,
      rain1h: latestReading.rain1h,
      computedFields: result.computedFields,
      wuResponse: result.wuResponse,
    };

    if (result.success) {
      // Redact sensitive data from payload
      const redactedPayload = result.payload
        ? { ...result.payload, ID: '***', PASSWORD: '***' }
        : undefined;

      await prisma.auditLog.create({
        data: {
          action: 'wu_upload',
          source: 'wunderground',
          details: {
            ...auditDetails,
            payload: redactedPayload,
            success: true,
          },
        },
      });

      // Update last uploaded reading ID
      lastUploadedReadingId.set(stationId, latestReading.id);

      console.log('Weather Underground: Upload successful', {
        response: result.wuResponse,
      });
    } else {
      await prisma.auditLog.create({
        data: {
          action: 'wu_upload_failed',
          source: 'wunderground',
          details: {
            ...auditDetails,
            error: result.error,
            success: false,
          },
        },
      });

      console.error('Weather Underground: Upload failed', {
        error: result.error,
        response: result.wuResponse,
      });
    }
  } catch (error) {
    console.error('Weather Underground: Error during upload', error);

    // Log error to audit log
    await prisma.auditLog.create({
      data: {
        action: 'wu_upload_failed',
        source: 'wunderground',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        },
      },
    });
  } finally {
    uploadInProgress = false;
  }
}

