import axios, { AxiosInstance } from 'axios';

// Get API base URL from environment variable
// Production must use NEXT_PUBLIC_API_URL (e.g., https://api.253510thave.com)
function getApiBase(): string {
  const apiBase = process.env.NEXT_PUBLIC_API_URL;
  if (!apiBase) {
    // Only throw at runtime, not during build/SSR
    if (typeof window !== 'undefined') {
      throw new Error('NEXT_PUBLIC_API_URL environment variable is required');
    }
    // During build/SSR, return empty string to avoid build errors
    // This will cause requests to fail at runtime if env var is missing
    return '';
  }
  return apiBase;
}

// Note: In a real app, you'd handle auth differently
// For Phase 1, we'll use a simple approach
let authToken: string | null = null;

export function setAuthToken(token: string): void {
  authToken = token;
}

function createClient(): AxiosInstance {
  const client = axios.create({
    baseURL: '', // Will be set dynamically in interceptor
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Add auth token to requests if available
  // Also set baseURL dynamically to ensure env var is read at request time
  client.interceptors.request.use((config) => {
    // Set baseURL from env var at request time
    config.baseURL = getApiBase();
    
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
  soilMoisture: number | null; // Deprecated: use soilMoistureValues
  soilMoistureValues?: Record<string, number> | null; // { "soil_ch1": 45.2, "soil_ch2": 38.5, ... }
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

export interface RachioScheduleZone {
  zoneId: string;
  zoneNumber?: number;
  duration: number;
  sortOrder: number;
}

export interface RachioWeatherIntelligence {
  rainSkip?: boolean;
  freezeSkip?: boolean;
  windSkip?: boolean;
  saturationSkip?: boolean;
  seasonalShift?: boolean;
  etSkip?: boolean; // Evapotranspiration skip
  weatherIntelligenceSensitivity?: number;
}

export interface RachioSchedule {
  id: string;
  name: string;
  enabled: boolean;
  zones: RachioScheduleZone[];
  startDate?: number;
  totalDuration?: number;
  deviceId: string;
  // Schedule timing
  scheduleJobTypes?: string[]; // e.g., ["INTERVAL_14", "DAY_OF_WEEK_3"]
  summary?: string; // e.g., "Every Wed at 9:05 AM"
  startHour?: number;
  startMinute?: number;
  operator?: string; // e.g., "AFTER"
  startDay?: number;
  startMonth?: number;
  startYear?: number;
  interval?: number; // Days between waterings
  startTime?: number; // Start time (seconds since midnight or timestamp)
  endDate?: number | null; // End date timestamp
  // Cycle and soak
  cycleSoak?: boolean;
  cycleSoakStatus?: string; // "ON" or "OFF"
  cycles?: number;
  totalDurationNoCycle?: number;
  // Weather intelligence
  rainDelay?: boolean;
  waterBudget?: boolean;
  weatherIntelligence?: RachioWeatherIntelligence;
  weatherIntelligenceSensitivity?: number;
  seasonalAdjustment?: number;
  // Other fields
  color?: string | null; // Hex color code
  repeat?: any; // Repeat configuration object
  externalName?: string; // External name for the schedule
}

export interface SoilMoistureSensorCondition {
  channel: number; // 1-16
  operator: '>=' | '<=' | '>' | '<' | '==';
  value: number;
}

export interface SoilMoistureCondition {
  sensors: SoilMoistureSensorCondition[];
  logic?: 'AND' | 'OR'; // Default: AND
}

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: {
    rain24h?: { operator: '>=' | '<=' | '>' | '<' | '=='; value: number };
    soilMoisture?: 
      | { operator: '>=' | '<=' | '>' | '<' | '=='; value: number } // Old format (backward compatibility)
      | SoilMoistureCondition; // New format (multiple sensors)
    rain1h?: { operator: '>=' | '<=' | '>' | '<' | '=='; value: number };
    temperature?: { operator: '>=' | '<=' | '>' | '<' | '=='; value: number };
    humidity?: { operator: '>=' | '<=' | '>' | '<' | '=='; value: number };
  };
  actions: {
    type: 'set_rain_delay' | 'run_zone';
    hours?: number;
    minutes?: number;
    zoneIds?: string[]; // Array of zone IDs for run_zone action
  };
  lastRunAt?: string | null;
  lastResult?: string | null;
  createdAt: string;
  updatedAt: string;
  source?: 'custom' | 'rachio'; // Indicates if this is a custom rule or Rachio schedule
  deviceId?: string; // For Rachio schedules
  deviceName?: string; // For Rachio schedules
  scheduleZones?: RachioScheduleZone[]; // Original zone data with durations for Rachio schedules
  // Additional Rachio schedule fields
  scheduleJobTypes?: string[]; // e.g., ["INTERVAL_14", "DAY_OF_WEEK_3"]
  summary?: string; // e.g., "Every Wed at 9:05 AM"
  startHour?: number;
  startMinute?: number;
  operator?: string; // e.g., "AFTER"
  startDay?: number;
  startMonth?: number;
  startYear?: number;
  interval?: number; // Days between waterings
  startTime?: number; // Start time (seconds since midnight or timestamp)
  startDate?: number; // Start date timestamp (for Rachio schedules)
  endDate?: number | null; // End date timestamp
  cycleSoak?: boolean;
  cycleSoakStatus?: string; // "ON" or "OFF"
  cycles?: number;
  totalDurationNoCycle?: number;
  rainDelay?: boolean;
  waterBudget?: boolean;
  weatherIntelligence?: RachioWeatherIntelligence;
  weatherIntelligenceSensitivity?: number;
  seasonalAdjustment?: number;
  color?: string | null; // Hex color code
  repeat?: any; // Repeat configuration object
  externalName?: string; // External name for the schedule
}

export interface DailyForecast {
  date: string; // YYYY-MM-DD
  tempMaxC: number;
  tempMinC: number;
  precipProbMax: number; // 0-100
  precipSumMm: number;
  windMaxKph?: number;
}

export interface Forecast7DayResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  generatedAt: string; // ISO
  days: DailyForecast[]; // length 7
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

  async getSchedules(deviceId?: string): Promise<RachioSchedule[]> {
    const response = await api.get<RachioSchedule[]>('/api/rachio/schedules', {
      params: deviceId ? { deviceId } : {},
    });
    return response.data;
  },

  async enableSchedule(id: string): Promise<void> {
    await api.put(`/api/rachio/schedules/${id}/enable`);
  },

  async startSchedule(id: string): Promise<void> {
    await api.put(`/api/rachio/schedules/${id}/start`);
  },

  async skipSchedule(id: string): Promise<void> {
    await api.put(`/api/rachio/schedules/${id}/skip`);
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

export const forecastApi = {
  async get7Day(lat?: number, lon?: number): Promise<Forecast7DayResponse> {
    const params: Record<string, string> = {};
    if (lat !== undefined) {
      params.lat = lat.toString();
    }
    if (lon !== undefined) {
      params.lon = lon.toString();
    }
    const response = await api.get<Forecast7DayResponse>('/api/forecast/7day', {
      params,
    });
    return response.data;
  },
};

export interface SoilMoistureSensor {
  id: string;
  channel: number; // 1-16
  name: string;
  enabled: boolean;
  currentValue?: number | null;
  lastReadingAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const sensorApi = {
  async getSensors(): Promise<SoilMoistureSensor[]> {
    const response = await api.get<SoilMoistureSensor[]>('/api/sensors');
    return response.data;
  },

  async getSensor(id: string): Promise<SoilMoistureSensor> {
    const response = await api.get<SoilMoistureSensor>(`/api/sensors/${id}`);
    return response.data;
  },

  async createSensor(data: { channel: number; name?: string; enabled?: boolean }): Promise<SoilMoistureSensor> {
    const response = await api.post<SoilMoistureSensor>('/api/sensors', data);
    return response.data;
  },

  async updateSensor(id: string, data: { name?: string; enabled?: boolean }): Promise<SoilMoistureSensor> {
    const response = await api.put<SoilMoistureSensor>(`/api/sensors/${id}`, data);
    return response.data;
  },

  async deleteSensor(id: string): Promise<void> {
    await api.delete(`/api/sensors/${id}`);
  },
};

