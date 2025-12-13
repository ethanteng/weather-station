import axios, { AxiosInstance } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Note: In a real app, you'd handle auth differently
// For Phase 1, we'll use a simple approach
let authToken: string | null = null;

export function setAuthToken(token: string): void {
  authToken = token;
}

function createClient(): AxiosInstance {
  const client = axios.create({
    baseURL: API_URL,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Add auth token to requests if available
  client.interceptors.request.use((config) => {
    if (authToken) {
      config.headers.Authorization = `Bearer ${authToken}`;
    }
    return config;
  });

  return client;
}

const api = createClient();

export interface WeatherReading {
  id: string;
  timestamp: string;
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  rain1h: number | null;
  rain24h: number | null;
  rainTotal: number | null;
  soilMoisture: number | null;
}

export interface WeatherSummary {
  range: string;
  count: number;
  latest: WeatherReading;
  avgTemperature: number | null;
  avgHumidity: number | null;
  avgPressure: number | null;
  totalRainfall: number | null;
  maxSoilMoisture: number | null;
  minSoilMoisture: number | null;
  readings: Array<{
    timestamp: string;
    temperature: number | null;
    humidity: number | null;
    pressure: number | null;
    rain24h: number | null;
    soilMoisture: number | null;
  }>;
}

export interface RachioDevice {
  id: string;
  name: string;
  status: string;
  zones: RachioZone[];
}

export interface RachioZone {
  id: string;
  name: string;
  enabled: boolean;
}

export interface WateringEvent {
  id: string;
  timestamp: string;
  zoneId: string;
  durationSec: number;
  source: 'manual' | 'schedule' | 'automation';
}

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  description: string;
}

export const weatherApi = {
  async getLatest(): Promise<WeatherReading> {
    const response = await api.get<WeatherReading>('/api/weather/latest');
    return response.data;
  },

  async getSummary(range: '24h' | '7d' | '30d' = '24h'): Promise<WeatherSummary> {
    const response = await api.get<WeatherSummary>('/api/weather/summary', {
      params: { range },
    });
    return response.data;
  },
};

export const rachioApi = {
  async getDevices(): Promise<RachioDevice[]> {
    const response = await api.get<RachioDevice[]>('/api/rachio/devices');
    return response.data;
  },

  async getZones(deviceId: string): Promise<RachioZone[]> {
    const response = await api.get<RachioZone[]>('/api/rachio/zones', {
      params: { deviceId },
    });
    return response.data;
  },
};

export const automationApi = {
  async getRules(): Promise<AutomationRule[]> {
    const response = await api.get<AutomationRule[]>('/api/automations');
    return response.data;
  },

  async run(): Promise<void> {
    await api.post('/api/automations/run');
  },
};

export const wateringApi = {
  async getEvents(limit = 10): Promise<WateringEvent[]> {
    const response = await api.get<WateringEvent[]>('/api/rachio/watering-events', {
      params: { limit },
    });
    return response.data;
  },
};

