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
  outdoor?: {
    temperature?: { time: string; unit: string; value: string };
    humidity?: { time: string; unit: string; value: string };
    feels_like?: { time: string; unit: string; value: string };
    app_temp?: { time: string; unit: string; value: string };
    dew_point?: { time: string; unit: string; value: string };
  };
  indoor?: {
    temperature?: { time: string; unit: string; value: string };
    humidity?: { time: string; unit: string; value: string };
  };
  rainfall?: {
    rain_rate?: { time: string; unit: string; value: string };
    daily?: { time: string; unit: string; value: string };
    event?: { time: string; unit: string; value: string };
    hourly?: { time: string; unit: string; value: string };
    weekly?: { time: string; unit: string; value: string };
    monthly?: { time: string; unit: string; value: string };
    yearly?: { time: string; unit: string; value: string };
  };
  pressure?: {
    relative?: { time: string; unit: string; value: string };
    absolute?: { time: string; unit: string; value: string };
  };
  [key: string]: unknown; // Allow other fields
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
   * Format MAC address for Ecowitt API
   * Ecowitt API expects MAC addresses with colons: "FF:FF:FF:FF:FF:FF"
   */
  private formatMacAddress(mac: string): string {
    // Remove existing colons/spaces, then add colons every 2 characters
    const cleaned = mac.replace(/[:-\s]/g, '').toUpperCase();
    return cleaned.match(/.{2}/g)?.join(':') || cleaned;
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
   * Get device real-time data including sensor readings
   * Uses /device/real_time endpoint per Ecowitt API v3 documentation
   */
  async getDeviceData(deviceId: string): Promise<EcowittDeviceData> {
    try {
      // Format MAC address with colons as required by Ecowitt API
      const macAddress = this.formatMacAddress(deviceId);
      
      console.log(`Fetching Ecowitt device data for MAC: ${macAddress}`);
      
      const response = await this.client.get('/device/real_time', {
        params: {
          application_key: this.applicationKey,
          api_key: this.apiKey,
          mac: macAddress,
          call_back: 'all', // Request all available data
        },
      });

      // Log raw payload for debugging
      console.log(`Ecowitt device data response for ${deviceId}:`, JSON.stringify(response.data, null, 2));

      // Check if response indicates success (code 0 = success per API docs)
      if (response.data?.code === 0 && response.data?.data) {
        return response.data.data as EcowittDeviceData;
      }
      
      // If code is not 0, log the error message
      if (response.data?.code !== undefined && response.data?.code !== 0) {
        throw new Error(`Ecowitt API returned code ${response.data.code}: ${response.data.msg || 'Unknown error'}`);
      }

      throw new Error('Invalid response structure from Ecowitt API');
    } catch (error: any) {
      console.error(`Error fetching Ecowitt device data for ${deviceId}:`, error);
      throw new Error(`Failed to fetch Ecowitt device data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse weather data from Ecowitt API v3 response structure
   * Maps the nested structure (outdoor.temperature.value, rainfall.hourly.value, etc.)
   */
  parseWeatherData(deviceData: EcowittDeviceData): ParsedWeatherData {
    const parsed: ParsedWeatherData = {};

    // Parse temperature from outdoor.temperature.value
    if (deviceData.outdoor?.temperature?.value) {
      const temp = parseFloat(deviceData.outdoor.temperature.value);
      if (!isNaN(temp)) {
        parsed.temperature = temp;
      }
    }

    // Parse humidity from outdoor.humidity.value
    if (deviceData.outdoor?.humidity?.value) {
      const hum = parseFloat(deviceData.outdoor.humidity.value);
      if (!isNaN(hum)) {
        parsed.humidity = hum;
      }
    }

    // Parse pressure from pressure.relative.value (or absolute)
    if (deviceData.pressure?.relative?.value) {
      const press = parseFloat(deviceData.pressure.relative.value);
      if (!isNaN(press)) {
        parsed.pressure = press;
      }
    } else if (deviceData.pressure?.absolute?.value) {
      const press = parseFloat(deviceData.pressure.absolute.value);
      if (!isNaN(press)) {
        parsed.pressure = press;
      }
    }

    // Parse rainfall - hourly = rain1h, daily = rain24h
    if (deviceData.rainfall?.hourly?.value) {
      const rain1h = parseFloat(deviceData.rainfall.hourly.value);
      if (!isNaN(rain1h)) {
        parsed.rain1h = rain1h;
      }
    }
    if (deviceData.rainfall?.daily?.value) {
      const rain24h = parseFloat(deviceData.rainfall.daily.value);
      if (!isNaN(rain24h)) {
        parsed.rain24h = rain24h;
      }
    }
    if (deviceData.rainfall?.yearly?.value) {
      const rainTotal = parseFloat(deviceData.rainfall.yearly.value);
      if (!isNaN(rainTotal)) {
        parsed.rainTotal = rainTotal;
      }
    }

    // Look for soil moisture in other sensor fields
    // Soil moisture might be in sub-device fields like "WFC01-0xxxxxx8" or similar
    for (const [key, value] of Object.entries(deviceData)) {
      if (key.toLowerCase().includes('soil') && typeof value === 'object' && value !== null) {
        const soilData = value as Record<string, { value?: string }>;
        for (const [_field, fieldData] of Object.entries(soilData)) {
          if (fieldData?.value) {
            const moisture = parseFloat(fieldData.value);
            if (!isNaN(moisture)) {
              parsed.soilMoisture = moisture;
              break;
            }
          }
        }
        if (parsed.soilMoisture) break;
      }
    }

    return parsed;
  }

}

