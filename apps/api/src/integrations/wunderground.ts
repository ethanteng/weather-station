import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { WeatherReading } from '@prisma/client';

const prisma = new PrismaClient();

export interface WUUploadResult {
  success: boolean;
  skipped?: boolean;
  payload?: Record<string, string | number>;
  wuResponse?: string;
  computedFields?: Record<string, number>;
  error?: string;
}

export interface WUFormattedData {
  tempf?: number;
  humidity?: number;
  baromin?: number;
  rainin?: number;
  dailyrainin?: number;
}

/**
 * Detect unit from rawPayload and convert if needed
 */
function detectAndConvertUnits(
  reading: WeatherReading,
  rawPayload: any
): WUFormattedData {
  const result: WUFormattedData = {};

  // Temperature: Check unit and convert if needed
  if (reading.temperature !== null && reading.temperature !== undefined) {
    const tempUnit = rawPayload?.outdoor?.temperature?.unit?.toLowerCase() || '';
    if (tempUnit.includes('c') && !tempUnit.includes('f')) {
      // Convert Celsius to Fahrenheit
      result.tempf = (reading.temperature * 9) / 5 + 32;
    } else {
      // Already Fahrenheit or unknown (assume Imperial)
      result.tempf = reading.temperature;
    }
  }

  // Humidity: Use as-is (always percentage)
  if (reading.humidity !== null && reading.humidity !== undefined) {
    result.humidity = Math.round(reading.humidity);
  }

  // Pressure: Prefer absolute, check unit and convert if needed
  if (reading.pressure !== null && reading.pressure !== undefined) {
    const pressureUnit = 
      rawPayload?.pressure?.absolute?.unit?.toLowerCase() ||
      rawPayload?.pressure?.relative?.unit?.toLowerCase() ||
      '';
    
    if (pressureUnit.includes('hpa') || pressureUnit.includes('mbar')) {
      // Convert hPa/mbar to inHg
      result.baromin = reading.pressure * 0.029529983071445;
    } else {
      // Already inHg or unknown (assume Imperial)
      result.baromin = reading.pressure;
    }
  }

  // Rainfall: Check unit and convert if needed
  if (reading.rain1h !== null && reading.rain1h !== undefined) {
    const rainUnit = 
      rawPayload?.rainfall?.hourly?.unit?.toLowerCase() ||
      rawPayload?.rainfall?.daily?.unit?.toLowerCase() ||
      '';
    
    if (rainUnit.includes('mm')) {
      // Convert mm to inches
      result.rainin = reading.rain1h / 25.4;
    } else {
      // Already inches or unknown (assume Imperial)
      result.rainin = reading.rain1h;
    }
  }

  if (reading.rain24h !== null && reading.rain24h !== undefined) {
    const rainUnit = 
      rawPayload?.rainfall?.daily?.unit?.toLowerCase() ||
      rawPayload?.rainfall?.hourly?.unit?.toLowerCase() ||
      '';
    
    if (rainUnit.includes('mm')) {
      // Convert mm to inches
      result.dailyrainin = reading.rain24h / 25.4;
    } else {
      // Already inches or unknown (assume Imperial)
      result.dailyrainin = reading.rain24h;
    }
  }

  return result;
}

/**
 * Convert WeatherReading to WU format
 */
export function convertToWUFormat(reading: WeatherReading): WUFormattedData {
  const rawPayload = reading.rawPayload as any;
  return detectAndConvertUnits(reading, rawPayload);
}

/**
 * Check if upload should proceed based on delta from last upload
 */
export function shouldUpload(
  current: WeatherReading,
  lastUploaded: WeatherReading | null
): boolean {
  if (!lastUploaded) {
    return true; // No previous upload, always upload
  }

  // Check temperature delta (>= 0.2°F)
  if (
    current.temperature !== null &&
    lastUploaded.temperature !== null &&
    Math.abs(current.temperature - lastUploaded.temperature) >= 0.2
  ) {
    return true;
  }

  // Check humidity delta (>= 2%)
  if (
    current.humidity !== null &&
    lastUploaded.humidity !== null &&
    Math.abs(current.humidity - lastUploaded.humidity) >= 2
  ) {
    return true;
  }

  // Check pressure delta (>= 0.02 inHg)
  if (
    current.pressure !== null &&
    lastUploaded.pressure !== null &&
    Math.abs(current.pressure - lastUploaded.pressure) >= 0.02
  ) {
    return true;
  }

  // Always upload if rain increased
  if (
    current.rain24h !== null &&
    lastUploaded.rain24h !== null &&
    current.rain24h > lastUploaded.rain24h
  ) {
    return true;
  }

  // No material change
  return false;
}

/**
 * Upload weather data to Weather Underground
 */
export async function uploadToWeatherUnderground(
  reading: WeatherReading
): Promise<WUUploadResult> {
  const stationId = process.env.WU_STATION_ID;
  const apiKey = process.env.WU_API_KEY;

  if (!stationId || !apiKey) {
    return {
      success: false,
      error: 'WU_STATION_ID and WU_API_KEY must be configured',
    };
  }

  // Convert reading to WU format
  const wuData = convertToWUFormat(reading);

  // Build form data
  const params = new URLSearchParams();
  params.append('ID', stationId);
  params.append('PASSWORD', apiKey);
  params.append('dateutc', 'now');
  params.append('action', 'updateraw');

  // Add fields only if present
  if (wuData.tempf !== undefined) {
    params.append('tempf', wuData.tempf.toFixed(1));
  }
  if (wuData.humidity !== undefined) {
    params.append('humidity', wuData.humidity.toString());
  }
  if (wuData.baromin !== undefined) {
    params.append('baromin', wuData.baromin.toFixed(2));
  }
  if (wuData.rainin !== undefined) {
    params.append('rainin', wuData.rainin.toFixed(2));
  }
  if (wuData.dailyrainin !== undefined) {
    params.append('dailyrainin', wuData.dailyrainin.toFixed(2));
  }

  try {
    const response = await axios.post(
      'https://weatherstation.wunderground.com/weatherstation/updateweatherstation.php',
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
      }
    );

    const responseText = response.data?.toString() || '';
    const success = responseText.toLowerCase().includes('success');

    return {
      success,
      payload: Object.fromEntries(params.entries()),
      wuResponse: responseText,
      computedFields: wuData,
      error: success ? undefined : `WU returned: ${responseText}`,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      payload: Object.fromEntries(params.entries()),
      computedFields: wuData,
      error: `HTTP error: ${errorMessage}`,
    };
  }
}

