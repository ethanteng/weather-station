import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/weather/latest
 * Get the most recent weather reading
 */
router.get('/latest', async (req: Request, res: Response) => {
  try {
    const reading = await prisma.weatherReading.findFirst({
      orderBy: {
        timestamp: 'desc',
      },
    });

    if (!reading) {
      return res.status(404).json({ error: 'No weather data available' });
    }

    res.json(reading);
  } catch (error) {
    console.error('Error fetching latest weather:', error);
    res.status(500).json({ error: 'Failed to fetch weather data' });
  }
});

/**
 * GET /api/weather/summary
 * Get aggregated weather statistics
 * Query params: range (24h|7d|30d)
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

    const readings = await prisma.weatherReading.findMany({
      where: {
        timestamp: {
          gte: startDate,
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

    // Calculate aggregates
    const temps = readings.map(r => r.temperature).filter((t): t is number => t !== null);
    const humidities = readings.map(r => r.humidity).filter((h): h is number => h !== null);
    const pressures = readings.map(r => r.pressure).filter((p): p is number => p !== null);
    const rains = readings.map(r => r.rain24h).filter((r): r is number => r !== null);
    const soilMoistures = readings.map(r => r.soilMoisture).filter((s): s is number => s !== null);

    const latest = readings[readings.length - 1];

    res.json({
      range,
      count: readings.length,
      latest: {
        timestamp: latest.timestamp,
        temperature: latest.temperature,
        humidity: latest.humidity,
        pressure: latest.pressure,
        rain24h: latest.rain24h,
        soilMoisture: latest.soilMoisture,
      },
      avgTemperature: temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : null,
      avgHumidity: humidities.length > 0 ? humidities.reduce((a, b) => a + b, 0) / humidities.length : null,
      avgPressure: pressures.length > 0 ? pressures.reduce((a, b) => a + b, 0) / pressures.length : null,
      totalRainfall: rains.length > 0 ? Math.max(...rains) : null, // Use max rain24h as total
      maxSoilMoisture: soilMoistures.length > 0 ? Math.max(...soilMoistures) : null,
      minSoilMoisture: soilMoistures.length > 0 ? Math.min(...soilMoistures) : null,
      readings: readings.map(r => ({
        timestamp: r.timestamp,
        temperature: r.temperature,
        humidity: r.humidity,
        pressure: r.pressure,
        rain24h: r.rain24h,
        soilMoisture: r.soilMoisture,
      })),
    });
  } catch (error) {
    console.error('Error fetching weather summary:', error);
    res.status(500).json({ error: 'Failed to fetch weather summary' });
  }
});

export default router;

