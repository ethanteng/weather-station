import { Router, Request, Response } from 'express';
import { OpenMeteoClient, Forecast7DayResponse, Forecast16DayResponse } from '../clients/openMeteo';

const router = Router();
const client = new OpenMeteoClient();

// In-memory cache: Map<cacheKey, { data: Forecast7DayResponse | Forecast16DayResponse, expiresAt: number }>
const cache7Day = new Map<string, { data: Forecast7DayResponse; expiresAt: number }>();
const cache16Day = new Map<string, { data: Forecast16DayResponse; expiresAt: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Generate cache key from lat/lon (rounded to 2 decimals)
 */
function getCacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)}_${lon.toFixed(2)}`;
}

/**
 * Get cached 7-day forecast if available and not expired
 */
function getCached7DayForecast(cacheKey: string): Forecast7DayResponse | null {
  const cached = cache7Day.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (Date.now() > cached.expiresAt) {
    // Expired, remove from cache
    cache7Day.delete(cacheKey);
    return null;
  }

  return cached.data;
}

/**
 * Store 7-day forecast in cache
 */
function setCached7DayForecast(cacheKey: string, data: Forecast7DayResponse): void {
  cache7Day.set(cacheKey, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/**
 * Get cached 16-day forecast if available and not expired
 */
function getCached16DayForecast(cacheKey: string): Forecast16DayResponse | null {
  const cached = cache16Day.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (Date.now() > cached.expiresAt) {
    // Expired, remove from cache
    cache16Day.delete(cacheKey);
    return null;
  }

  return cached.data;
}

/**
 * Store 16-day forecast in cache
 */
function setCached16DayForecast(cacheKey: string, data: Forecast16DayResponse): void {
  cache16Day.set(cacheKey, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/**
 * GET /api/forecast/7day?lat=...&lon=...
 * Get 7-day weather forecast from Open-Meteo API
 */
router.get('/7day', async (req: Request, res: Response) => {
  try {
    // Extract lat/lon from query params or env vars
    let lat: number | undefined;
    let lon: number | undefined;

    if (req.query.lat) {
      lat = parseFloat(req.query.lat as string);
    } else {
      const envLat = process.env.FORECAST_LAT;
      if (envLat) {
        lat = parseFloat(envLat);
      }
    }

    if (req.query.lon) {
      lon = parseFloat(req.query.lon as string);
    } else {
      const envLon = process.env.FORECAST_LON;
      if (envLon) {
        lon = parseFloat(envLon);
      }
    }

    // Validate coordinates
    if (lat === undefined || lon === undefined || isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({
        error: 'Missing or invalid coordinates. Provide lat/lon query params or set FORECAST_LAT/FORECAST_LON env vars.',
      });
    }

    if (lat < -90 || lat > 90) {
      return res.status(400).json({
        error: 'Invalid latitude. Must be between -90 and 90.',
      });
    }

    if (lon < -180 || lon > 180) {
      return res.status(400).json({
        error: 'Invalid longitude. Must be between -180 and 180.',
      });
    }

    const cacheKey = getCacheKey(lat, lon);

    // Check cache first
    const cached = getCached7DayForecast(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Fetch from Open-Meteo
    try {
      const forecast = await client.get7DayForecast(lat, lon);
      setCached7DayForecast(cacheKey, forecast);
      return res.json(forecast);
    } catch (error) {
      console.error('Error fetching forecast from Open-Meteo:', error);

      // Try to return cached data even if expired (graceful degradation)
      const expiredCache = cache7Day.get(cacheKey);
      if (expiredCache) {
        console.warn('Returning expired cache due to API failure');
        res.setHeader('X-Cache-Status', 'expired');
        return res.json(expiredCache.data);
      }

      // No cache available, return error
      return res.status(502).json({
        error: 'Failed to fetch forecast from upstream service',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  } catch (error) {
    console.error('Error in forecast route:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/forecast/16day?lat=...&lon=...
 * Get 16-day weather forecast from Open-Meteo API
 */
router.get('/16day', async (req: Request, res: Response) => {
  try {
    // Extract lat/lon from query params or env vars
    let lat: number | undefined;
    let lon: number | undefined;

    if (req.query.lat) {
      lat = parseFloat(req.query.lat as string);
    } else {
      const envLat = process.env.FORECAST_LAT;
      if (envLat) {
        lat = parseFloat(envLat);
      }
    }

    if (req.query.lon) {
      lon = parseFloat(req.query.lon as string);
    } else {
      const envLon = process.env.FORECAST_LON;
      if (envLon) {
        lon = parseFloat(envLon);
      }
    }

    // Validate coordinates
    if (lat === undefined || lon === undefined || isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({
        error: 'Missing or invalid coordinates. Provide lat/lon query params or set FORECAST_LAT/FORECAST_LON env vars.',
      });
    }

    if (lat < -90 || lat > 90) {
      return res.status(400).json({
        error: 'Invalid latitude. Must be between -90 and 90.',
      });
    }

    if (lon < -180 || lon > 180) {
      return res.status(400).json({
        error: 'Invalid longitude. Must be between -180 and 180.',
      });
    }

    const cacheKey = getCacheKey(lat, lon);

    // Check cache first
    const cached = getCached16DayForecast(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Fetch from Open-Meteo
    try {
      const forecast = await client.get16DayForecast(lat, lon);
      setCached16DayForecast(cacheKey, forecast);
      return res.json(forecast);
    } catch (error) {
      console.error('Error fetching forecast from Open-Meteo:', error);

      // Try to return cached data even if expired (graceful degradation)
      const expiredCache = cache16Day.get(cacheKey);
      if (expiredCache) {
        console.warn('Returning expired cache due to API failure');
        res.setHeader('X-Cache-Status', 'expired');
        return res.json(expiredCache.data);
      }

      // No cache available, return error
      return res.status(502).json({
        error: 'Failed to fetch forecast from upstream service',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  } catch (error) {
    console.error('Error in forecast route:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
