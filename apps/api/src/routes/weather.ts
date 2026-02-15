import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/weather/latest
 * Get the most recent weather reading
 */
router.get('/latest', async (_req: Request, res: Response) => {
  try {
    const reading = await prisma.weatherReading.findFirst({
      orderBy: {
        timestamp: 'desc',
      },
    });

    if (!reading) {
      return res.status(404).json({ error: 'No weather data available' });
    }

    return res.json(reading);
  } catch (error) {
    console.error('Error fetching latest weather:', error);
    return res.status(500).json({ error: 'Failed to fetch weather data' });
  }
});

/**
 * Compute rolling 24-hour rainfall for a reading using rainTotal (cumulative).
 * rainTotal never resets within a 24h window (yearly counter), so we can derive
 * rolling 24h = rainTotal(now) - rainTotal(24h ago).
 * Falls back to sensor rain24h (calendar-day, resets at midnight) if rainTotal unavailable.
 */
function computeRolling24hRainfall(
  reading: { timestamp: Date; rainTotal: number | null; rain24h: number | null },
  allReadings: Array<{ timestamp: Date; rainTotal: number | null }>
): number | null {
  if (reading.rainTotal === null) {
    return reading.rain24h;
  }
  const cutoff = new Date(reading.timestamp.getTime() - 24 * 60 * 60 * 1000);
  // Find reading closest to 24h ago (at or before cutoff)
  const priorReadings = allReadings.filter((r) => r.timestamp <= cutoff);
  if (priorReadings.length === 0) {
    return reading.rainTotal;
  }
  const prior = priorReadings.reduce((a, b) =>
    b.timestamp > a.timestamp ? b : a
  );
  if (prior.rainTotal === null) {
    return reading.rainTotal;
  }
  const rolling = reading.rainTotal - prior.rainTotal;
  return rolling >= 0 ? rolling : reading.rainTotal;
}

/**
 * GET /api/weather/summary
 * Get aggregated weather statistics
 * Query params: range (24h|7d|30d)
 * For 24h range: rainfall values use rolling 24-hour window (not calendar-day reset).
 */
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const range = req.query.range as string || '24h';
    
    let startDate: Date;
    const now = new Date();

    switch (range) {
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        return res.status(400).json({ error: 'Invalid range. Use 24h, 7d, or 30d' });
    }

    // For 24h range, fetch 48h of data to compute rolling 24h for each point
    const queryStart = range === '24h'
      ? new Date(now.getTime() - 48 * 60 * 60 * 1000)
      : startDate;

    const readings = await prisma.weatherReading.findMany({
      where: {
        timestamp: {
          gte: queryStart,
        },
      },
      orderBy: {
        timestamp: 'asc',
      },
    });

    if (readings.length === 0) {
      return res.json({
        range,
        count: 0,
        avgTemperature: null,
        avgHumidity: null,
        avgPressure: null,
        totalRainfall: null,
        maxSoilMoisture: null,
        minSoilMoisture: null,
        readings: [],
      });
    }

    // For 24h range, restrict to last 24h and compute rolling rainfall
    const displayReadings = range === '24h'
      ? readings.filter((r) => r.timestamp >= startDate)
      : readings;

    const rainfallValues = range === '24h'
      ? displayReadings.map((r) =>
          computeRolling24hRainfall(
            { timestamp: r.timestamp, rainTotal: r.rainTotal, rain24h: r.rain24h },
            readings.map((x) => ({ timestamp: x.timestamp, rainTotal: x.rainTotal }))
          )
        )
      : displayReadings.map((r) => r.rain24h);

    // Calculate aggregates
    const temps = displayReadings.map(r => r.temperature).filter((t): t is number => t !== null);
    const humidities = displayReadings.map(r => r.humidity).filter((h): h is number => h !== null);
    const pressures = displayReadings.map(r => r.pressure).filter((p): p is number => p !== null);
    const rains = rainfallValues.filter((r): r is number => r !== null);
    const soilMoistures = displayReadings.map(r => r.soilMoisture).filter((s): s is number => s !== null);

    const latest = displayReadings[displayReadings.length - 1];
    const latestRain24h = rainfallValues[displayReadings.length - 1] ?? latest.rain24h;

    return res.json({
      range,
      count: displayReadings.length,
      latest: {
        timestamp: latest.timestamp,
        temperature: latest.temperature,
        humidity: latest.humidity,
        pressure: latest.pressure,
        rain24h: latestRain24h,
        soilMoisture: latest.soilMoisture, // Backward compatibility
        soilMoistureValues: latest.soilMoistureValues,
      },
      avgTemperature: temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : null,
      avgHumidity: humidities.length > 0 ? humidities.reduce((a, b) => a + b, 0) / humidities.length : null,
      avgPressure: pressures.length > 0 ? pressures.reduce((a, b) => a + b, 0) / pressures.length : null,
      totalRainfall: rains.length > 0 ? Math.max(...rains) : null,
      maxSoilMoisture: soilMoistures.length > 0 ? Math.max(...soilMoistures) : null,
      minSoilMoisture: soilMoistures.length > 0 ? Math.min(...soilMoistures) : null,
      readings: displayReadings.map((r, i) => ({
        timestamp: r.timestamp,
        temperature: r.temperature,
        humidity: r.humidity,
        pressure: r.pressure,
        rain24h: rainfallValues[i] ?? r.rain24h,
        soilMoisture: r.soilMoisture, // Backward compatibility
        soilMoistureValues: r.soilMoistureValues,
      })),
    });
  } catch (error) {
    console.error('Error fetching weather summary:', error);
    return res.status(500).json({ error: 'Failed to fetch weather summary' });
  }
});

/**
 * GET /api/weather/discover
 * Discovery endpoint to debug Ecowitt API structure
 */
router.get('/discover', async (_req: Request, res: Response) => {
  try {
    const applicationKey = process.env.ECOWITT_APPLICATION_KEY;
    const apiKey = process.env.ECOWITT_API_KEY;

    if (!applicationKey || !apiKey) {
      return res.status(500).json({ error: 'Ecowitt credentials not configured' });
    }

    const { EcowittClient } = await import('../clients/ecowitt');
    const client = new EcowittClient(applicationKey, apiKey);

    // Try to get device list
    try {
      const devices = await client.getDeviceList();
      return res.json({
        success: true,
        deviceCount: devices.length,
        devices: devices,
        message: 'Check server logs for full API responses',
      });
    } catch (error) {
      return res.status(500).json({
        error: 'Failed to fetch devices',
        details: error instanceof Error ? error.message : 'Unknown error',
        message: 'Check server logs for full error details',
      });
    }
  } catch (error) {
    console.error('Error in discover endpoint:', error);
    return res.status(500).json({ error: 'Discovery failed' });
  }
});

export default router;

