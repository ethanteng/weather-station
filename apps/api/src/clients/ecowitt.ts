import axios, { AxiosInstance } from 'axios';

export interface EcowittDevice {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface EcowittSensorData {
  [sensorId: string]: {
    [field: string]: number | string | null;
  };
}

export interface EcowittDeviceData {
  device: EcowittDevice;
  sensors: EcowittSensorData;
}

export interface ParsedWeatherData {
  temperature?: number;
  humidity?: number;
  pressure?: number;
  rain1h?: number;
  rain24h?: number;
  rainTotal?: number;
  soilMoisture?: number;
}

export class EcowittClient {
  private client: AxiosInstance;
  private applicationKey: string;
  private apiKey: string;

  constructor(applicationKey: string, apiKey: string) {
    this.applicationKey = applicationKey;
    this.apiKey = apiKey;
    
    this.client = axios.create({
      baseURL: 'https://api.ecowitt.net/api/v3',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get list of devices
   */
  async getDeviceList(): Promise<EcowittDevice[]> {
    try {
      const response = await this.client.get('/device/list', {
        params: {
          application_key: this.applicationKey,
          api_key: this.apiKey,
        },
      });

      // TODO: Verify response structure from Ecowitt API v3
      // Log raw payload for debugging
      console.log('Ecowitt device list response:', JSON.stringify(response.data, null, 2));

      return response.data?.data?.list || [];
    } catch (error) {
      console.error('Error fetching Ecowitt device list:', error);
      throw new Error(`Failed to fetch Ecowitt devices: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get device data including sensor readings
   */
  async getDeviceData(deviceId: string): Promise<EcowittDeviceData> {
    try {
      const response = await this.client.get('/device/data', {
        params: {
          application_key: this.applicationKey,
          api_key: this.apiKey,
          mac: deviceId,
        },
      });

      // TODO: Verify response structure from Ecowitt API v3
      // Log raw payload for debugging
      console.log(`Ecowitt device data response for ${deviceId}:`, JSON.stringify(response.data, null, 2));

      return response.data?.data || {};
    } catch (error) {
      console.error(`Error fetching Ecowitt device data for ${deviceId}:`, error);
      throw new Error(`Failed to fetch Ecowitt device data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse weather data from Ecowitt sensor data
   * TODO: Map actual sensor channels based on discovery endpoint results
   */
  parseWeatherData(sensorData: EcowittSensorData): ParsedWeatherData {
    const parsed: ParsedWeatherData = {};

    // TODO: Update these field names based on actual Ecowitt API v3 response structure
    // Common field names to check:
    // - Temperature: temp, temperature, outdoor_temp
    // - Humidity: humidity, outdoor_humidity
    // - Pressure: pressure, barometric_pressure
    // - Rainfall: rain_1h, rain_24h, rain_total, rainfall_1h, rainfall_24h
    // - Soil Moisture: soil_moisture, soil_moisture_1, soil_moisture_2

    // Iterate through sensors to find relevant data
    for (const [_sensorId, sensorFields] of Object.entries(sensorData)) {
      for (const [field, value] of Object.entries(sensorFields)) {
        const fieldLower = field.toLowerCase();
        const numValue = typeof value === 'number' ? value : null;

        if (numValue === null) continue;

        // Temperature mapping
        if ((fieldLower.includes('temp') || fieldLower.includes('temperature')) && !parsed.temperature) {
          parsed.temperature = numValue;
        }

        // Humidity mapping
        if ((fieldLower.includes('humidity') || fieldLower.includes('hum')) && !parsed.humidity) {
          parsed.humidity = numValue;
        }

        // Pressure mapping
        if ((fieldLower.includes('pressure') || fieldLower.includes('barometric')) && !parsed.pressure) {
          parsed.pressure = numValue;
        }

        // Rainfall mappings
        if (fieldLower.includes('rain_1h') || fieldLower.includes('rainfall_1h')) {
          parsed.rain1h = numValue;
        }
        if (fieldLower.includes('rain_24h') || fieldLower.includes('rainfall_24h')) {
          parsed.rain24h = numValue;
        }
        if (fieldLower.includes('rain_total') || fieldLower.includes('rainfall_total')) {
          parsed.rainTotal = numValue;
        }

        // Soil moisture mapping
        if (fieldLower.includes('soil_moisture') || fieldLower.includes('soil')) {
          parsed.soilMoisture = numValue;
        }
      }
    }

    return parsed;
  }

}

