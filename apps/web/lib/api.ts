import axios, { AxiosInstance } from 'axios';

// Determine API URL dynamically based on current hostname
// This allows the app to work whether accessed via localhost or network IP
function getApiUrl(): string {
  // If explicitly set in env, use that
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  
  // Otherwise, detect based on current hostname (client-side only)
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    // If accessing via localhost, use localhost for API
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:3001';
    }
    // Otherwise, use the same hostname with port 3001
    return `http://${hostname}:3001`;
  }
  
  // Fallback for SSR
  return 'http://localhost:3001';
}

// Note: In a real app, you'd handle auth differently
// For Phase 1, we'll use a simple approach
let authToken: string | null = null;

export function setAuthToken(token: string): void {
  authToken = token;
}

function createClient(): AxiosInstance {
  // Start with a default baseURL (will be updated dynamically on client-side)
  const client = axios.create({
    baseURL: 'http://localhost:3001', // Default, will be overridden on client-side
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Add auth token to requests if available
  // Also update baseURL dynamically on each request (client-side only)
  client.interceptors.request.use((config) => {
    // Update baseURL dynamically if we're on the client side
    if (typeof window !== 'undefined') {
      config.baseURL = getApiUrl();
    }
    
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
  zoneNumber?: number | null;
  imageUrl?: string | null;
  area?: number | null;
  rootZoneDepth?: number | null;
  availableWater?: number | null;
  maxRuntime?: number | null;
  runtime?: number | null;
  customNozzle?: string | null;
  customShade?: string | null;
  customSlope?: string | null;
  customCrop?: string | null;
  customSoil?: string | null;
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
  conditions: {
    rain24h?: { operator: '>=' | '<=' | '>' | '<' | '=='; value: number };
    soilMoisture?: { operator: '>=' | '<=' | '>' | '<' | '=='; value: number };
    rain1h?: { operator: '>=' | '<=' | '>' | '<' | '=='; value: number };
    temperature?: { operator: '>=' | '<=' | '>' | '<' | '=='; value: number };
    humidity?: { operator: '>=' | '<=' | '>' | '<' | '=='; value: number };
  };
  actions: {
    type: 'set_rain_delay' | 'run_zone';
    hours?: number;
    minutes?: number;
  };
  lastRunAt?: string | null;
  lastResult?: string | null;
  createdAt: string;
  updatedAt: string;
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

  async getRule(id: string): Promise<AutomationRule> {
    const response = await api.get<AutomationRule>(`/api/automations/${id}`);
    return response.data;
  },

  async createRule(rule: Omit<AutomationRule, 'id' | 'createdAt' | 'updatedAt' | 'lastRunAt' | 'lastResult'>): Promise<AutomationRule> {
    const response = await api.post<AutomationRule>('/api/automations', rule);
    return response.data;
  },

  async updateRule(id: string, rule: Partial<AutomationRule>): Promise<AutomationRule> {
    const response = await api.put<AutomationRule>(`/api/automations/${id}`, rule);
    return response.data;
  },

  async deleteRule(id: string): Promise<void> {
    await api.delete(`/api/automations/${id}`);
  },

  async enableRule(id: string): Promise<AutomationRule> {
    const response = await api.post<AutomationRule>(`/api/automations/${id}/enable`);
    return response.data;
  },

  async disableRule(id: string): Promise<AutomationRule> {
    const response = await api.post<AutomationRule>(`/api/automations/${id}/disable`);
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

