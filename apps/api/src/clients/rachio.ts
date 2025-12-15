import axios, { AxiosInstance } from 'axios';

export interface RachioPerson {
  id: string;
  username: string;
  email: string;
  [key: string]: unknown;
}

export interface RachioDevice {
  id: string;
  name: string;
  status: string;
  serialNumber?: string;
  model?: string;
  zones?: RachioZone[];
  [key: string]: unknown;
}

export interface RachioZone {
  id: string;
  name: string;
  enabled: boolean;
  zoneNumber?: number;
  [key: string]: unknown;
}

export interface RachioRainDelay {
  id: string;
  duration: number;
  startTime: number;
  [key: string]: unknown;
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
  interval?: number; // Days between waterings (derived from scheduleJobTypes)
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
  [key: string]: unknown;
}

export class RachioRateLimitError extends Error {
  constructor(
    message: string,
    public resetTime: Date | null,
    public remaining: number | null
  ) {
    super(message);
    this.name = 'RachioRateLimitError';
  }
}

// Shared rate limit tracker across all RachioClient instances
class RachioRateLimitTracker {
  private rateLimitResetTime: Date | null = null;
  private rateLimitRemaining: number | null = null;
  private rateLimitLimit: number | null = null;

  setResetTime(resetTime: Date | null): void {
    this.rateLimitResetTime = resetTime;
  }

  setRateLimitInfo(remaining: number | null, limit: number | null): void {
    this.rateLimitRemaining = remaining;
    this.rateLimitLimit = limit;
  }

  getResetTime(): Date | null {
    // Clear if expired
    if (this.rateLimitResetTime && new Date() >= this.rateLimitResetTime) {
      this.rateLimitResetTime = null;
      this.rateLimitRemaining = null;
      this.rateLimitLimit = null;
    }
    return this.rateLimitResetTime;
  }

  isRateLimited(): boolean {
    const resetTime = this.getResetTime();
    return resetTime !== null && new Date() < resetTime;
  }

  getRemaining(): number | null {
    return this.rateLimitRemaining;
  }

  getLimit(): number | null {
    return this.rateLimitLimit;
  }
}

const rateLimitTracker = new RachioRateLimitTracker();

// Export function to get rate limit status without making API call
export function getRachioRateLimitStatus(): { 
  rateLimited: boolean; 
  resetTime: Date | null;
  remaining: number | null;
  limit: number | null;
} {
  const resetTime = rateLimitTracker.getResetTime();
  const remaining = rateLimitTracker.getRemaining();
  
  // Rate limited if:
  // 1. We have a resetTime set (from a 429 error), OR
  // 2. We have 0 or fewer calls remaining
  const rateLimited = (resetTime !== null && new Date() < resetTime) || 
                      (remaining !== null && remaining <= 0);
  
  return {
    rateLimited,
    resetTime,
    remaining,
    limit: rateLimitTracker.getLimit(),
  };
}

export class RachioClient {
  private client: AxiosInstance;
  // Static cache shared across all instances - person data rarely changes
  private static cachedPerson: { data: RachioPerson; timestamp: number } | null = null;
  private static readonly PERSON_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours cache
  // Static cache for schedules per device - refresh every 6 hours
  private static cachedSchedules: Map<string, { data: RachioSchedule[]; timestamp: number }> = new Map();
  private static readonly SCHEDULES_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours cache

  constructor(apiKey: string) {

    this.client = axios.create({
      baseURL: 'https://api.rach.io/1/public',
      timeout: 10000,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor to check rate limit before making requests
    this.client.interceptors.request.use(
      (config) => {
        // Check if we're still rate limited (using shared tracker)
        if (rateLimitTracker.isRateLimited()) {
          const resetTime = rateLimitTracker.getResetTime();
          if (resetTime) {
            const msUntilReset = resetTime.getTime() - Date.now();
            const minutesUntilReset = Math.ceil(msUntilReset / 60000);
            const hoursUntilReset = Math.floor(minutesUntilReset / 60);
            const remainingMinutes = minutesUntilReset % 60;
            const timeStr = hoursUntilReset > 0 
              ? `${hoursUntilReset}h ${remainingMinutes}m`
              : `${remainingMinutes}m`;
            throw new RachioRateLimitError(
              `Rate limit still active. Resets in ${timeStr}`,
              resetTime,
              null
            );
          }
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Add response interceptor to log rate limit headers and track reset time
    this.client.interceptors.response.use(
      (response) => {
        const remaining = response.headers['x-ratelimit-remaining'];
        const limit = response.headers['x-ratelimit-limit'];
        const reset = response.headers['x-ratelimit-reset'];
        
        // Store rate limit info (using shared tracker)
        if (remaining !== undefined && limit !== undefined) {
          const remainingNum = parseInt(remaining, 10);
          const limitNum = parseInt(limit, 10);
          if (!isNaN(remainingNum) && !isNaN(limitNum)) {
            rateLimitTracker.setRateLimitInfo(remainingNum, limitNum);
            
            // Only mark as rate limited if remaining is 0 or less
            // The reset header is informational and sent with every response,
            // so we only use it when we're actually out of calls
            if (remainingNum <= 0 && reset) {
              try {
                const resetDate = new Date(reset);
                rateLimitTracker.setResetTime(resetDate);
              } catch (e) {
                console.warn('Failed to parse rate limit reset time:', reset);
              }
            } else {
              // Clear reset time if we have calls remaining (not rate limited)
              // This ensures we don't show "rate limited" when we have calls left
              rateLimitTracker.setResetTime(null);
            }
            
            if (remainingNum < 100) {
              console.warn(`Rachio API rate limit warning: ${remainingNum}/${limitNum} requests remaining`);
            }
          }
        }
        
        return response;
      },
      async (error) => {
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'];
          const reset = error.response.headers['x-ratelimit-reset'];
          const remaining = error.response.headers['x-ratelimit-remaining'];
          const limit = error.response.headers['x-ratelimit-limit'];
          
          console.error(`Rachio API rate limit exceeded. Remaining: ${remaining}, Reset: ${reset}, Retry-After: ${retryAfter}`);
          
          // Store rate limit info (using shared tracker)
          if (remaining !== undefined && limit !== undefined) {
            const remainingNum = parseInt(remaining, 10);
            const limitNum = parseInt(limit, 10);
            if (!isNaN(remainingNum) && !isNaN(limitNum)) {
              rateLimitTracker.setRateLimitInfo(remainingNum, limitNum);
            }
          }
          
          // Store the reset time (using shared tracker)
          let resetDate: Date | null = null;
          if (reset) {
            try {
              resetDate = new Date(reset);
              rateLimitTracker.setResetTime(resetDate);
              console.log(`Rate limit will reset at: ${resetDate.toISOString()}`);
            } catch (e) {
              console.warn('Failed to parse rate limit reset time:', reset);
              // Fallback to retry-after if available
              if (retryAfter) {
                const retryAfterSeconds = parseInt(retryAfter, 10);
                if (!isNaN(retryAfterSeconds)) {
                  resetDate = new Date(Date.now() + retryAfterSeconds * 1000);
                  rateLimitTracker.setResetTime(resetDate);
                }
              }
            }
          } else if (retryAfter) {
            // Fallback to retry-after header
            const retryAfterSeconds = parseInt(retryAfter, 10);
            if (!isNaN(retryAfterSeconds)) {
              resetDate = new Date(Date.now() + retryAfterSeconds * 1000);
              rateLimitTracker.setResetTime(resetDate);
            }
          }
          
          // Throw a custom error with reset time
          throw new RachioRateLimitError(
            `Rachio API rate limit exceeded. Resets at ${resetDate?.toISOString() || 'unknown time'}`,
            resetDate,
            remaining ? parseInt(remaining, 10) : null
          );
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get person information (authenticated user)
   * Cached for 1 hour to reduce API calls
   */
  async getPerson(): Promise<RachioPerson> {
    // Check static cache first (shared across all instances)
    if (RachioClient.cachedPerson && Date.now() - RachioClient.cachedPerson.timestamp < RachioClient.PERSON_CACHE_TTL) {
      // Return cached data without making API call
      return RachioClient.cachedPerson.data;
    }

    try {
      const response = await this.client.get('/person/info');
      console.log('Rachio person API call (cache miss):', JSON.stringify(response.data, null, 2));
      
      // Cache the result in static cache (shared across all instances)
      RachioClient.cachedPerson = {
        data: response.data,
        timestamp: Date.now(),
      };
      
      return response.data;
    } catch (error) {
      // Don't wrap or log RachioRateLimitError - let it propagate
      if (error instanceof RachioRateLimitError) {
        throw error;
      }
      console.error('Error fetching Rachio person:', error);
      throw new Error(`Failed to fetch Rachio person: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all devices for the authenticated person
   */
  async getDevices(): Promise<RachioDevice[]> {
    try {
      const person = await this.getPerson();
      const personId = person.id;

      const response = await this.client.get(`/person/${personId}`);
      console.log('Rachio devices response:', JSON.stringify(response.data, null, 2));

      return response.data?.devices || [];
    } catch (error) {
      // Don't wrap or log RachioRateLimitError - let it propagate
      if (error instanceof RachioRateLimitError) {
        throw error;
      }
      console.error('Error fetching Rachio devices:', error);
      throw new Error(`Failed to fetch Rachio devices: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get zones for a specific device
   */
  async getZones(deviceId: string): Promise<RachioZone[]> {
    try {
      const response = await this.client.get(`/device/${deviceId}`);
      console.log(`Rachio zones response for device ${deviceId}:`, JSON.stringify(response.data, null, 2));

      return response.data?.zones || [];
    } catch (error) {
      // Don't wrap or log RachioRateLimitError - let it propagate
      if (error instanceof RachioRateLimitError) {
        throw error;
      }
      console.error(`Error fetching Rachio zones for device ${deviceId}:`, error);
      throw new Error(`Failed to fetch Rachio zones: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Set rain delay on a device
   * @param deviceId Device ID
   * @param hours Number of hours for rain delay (default 48)
   */
  async setRainDelay(deviceId: string, hours: number = 48): Promise<void> {
    try {
      const duration = hours * 3600; // Convert hours to seconds
      
      await this.client.put(`/device/${deviceId}/rain_delay`, {
        duration,
      });

      console.log(`Set rain delay on device ${deviceId} for ${hours} hours`);
    } catch (error) {
      console.error(`Error setting rain delay on device ${deviceId}:`, error);
      throw new Error(`Failed to set rain delay: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Run a zone for a specified duration
   * @param zoneId Zone ID
   * @param durationSec Duration in seconds
   */
  async runZone(zoneId: string, durationSec: number): Promise<void> {
    try {
      await this.client.put(`/zone/start`, {
        id: zoneId,
        duration: durationSec,
      });

      console.log(`Started zone ${zoneId} for ${durationSec} seconds`);
    } catch (error) {
      console.error(`Error running zone ${zoneId}:`, error);
      throw new Error(`Failed to run zone: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Stop all watering on a device
   * @param deviceId Device ID
   */
  async stopWatering(deviceId: string): Promise<void> {
    try {
      await this.client.put(`/device/${deviceId}/stop_water`);

      console.log(`Stopped watering on device ${deviceId}`);
    } catch (error) {
      console.error(`Error stopping watering on device ${deviceId}:`, error);
      throw new Error(`Failed to stop watering: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get current device status
   */
  async getDeviceStatus(deviceId: string): Promise<RachioDevice> {
    try {
      const response = await this.client.get(`/device/${deviceId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching device status for ${deviceId}:`, error);
      throw new Error(`Failed to fetch device status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get schedules for a specific device
   * @param deviceId Device ID
   */
  async getSchedules(deviceId: string): Promise<RachioSchedule[]> {
    // Check static cache first (shared across all instances)
    const cached = RachioClient.cachedSchedules.get(deviceId);
    if (cached && Date.now() - cached.timestamp < RachioClient.SCHEDULES_CACHE_TTL) {
      // Return cached data without making API call
      return cached.data;
    }

    try {
      const response = await this.client.get(`/device/${deviceId}`);
      const scheduleRules = response.data?.scheduleRules || [];
      
      // Debug: Log raw schedule data to understand structure (only on cache miss)
      if (scheduleRules.length > 0) {
        console.log(`[DEBUG] Raw Rachio schedule data for device ${deviceId} (cache miss):`, JSON.stringify(scheduleRules[0], null, 2));
      }
      
      const schedules = scheduleRules.map((schedule: any) => {
        // Extract weather intelligence fields
        const weatherIntelligence: RachioWeatherIntelligence = {};
        if (schedule.rainSkip !== undefined) weatherIntelligence.rainSkip = schedule.rainSkip === true;
        if (schedule.freezeSkip !== undefined) weatherIntelligence.freezeSkip = schedule.freezeSkip === true;
        if (schedule.windSkip !== undefined) weatherIntelligence.windSkip = schedule.windSkip === true;
        if (schedule.saturationSkip !== undefined) weatherIntelligence.saturationSkip = schedule.saturationSkip === true;
        if (schedule.seasonalShift !== undefined) weatherIntelligence.seasonalShift = schedule.seasonalShift === true;
        if (schedule.etSkip !== undefined) weatherIntelligence.etSkip = schedule.etSkip === true;
        if (schedule.weatherIntelligenceSensitivity !== undefined) {
          weatherIntelligence.weatherIntelligenceSensitivity = schedule.weatherIntelligenceSensitivity;
        }

        // Extract interval from scheduleJobTypes if present (e.g., "INTERVAL_14" -> 14)
        let interval: number | undefined = schedule.interval || schedule.frequency;
        if (!interval && schedule.scheduleJobTypes && schedule.scheduleJobTypes.length > 0) {
          const intervalMatch = schedule.scheduleJobTypes[0].match(/INTERVAL_(\d+)/);
          if (intervalMatch) {
            interval = parseInt(intervalMatch[1], 10);
          }
        }

        // Calculate start time from startHour and startMinute if available
        let startTime: number | undefined = schedule.startTime || schedule.startTimeOfDay;
        if (!startTime && schedule.startHour !== undefined && schedule.startMinute !== undefined) {
          startTime = schedule.startHour * 3600 + schedule.startMinute * 60;
        }

        return {
          id: schedule.id,
          name: schedule.name || schedule.externalName || 'Unnamed Schedule',
          enabled: schedule.enabled !== false,
          zones: (schedule.zones || []).map((z: any) => ({
            zoneId: z.zoneId,
            zoneNumber: z.zoneNumber,
            duration: z.duration,
            sortOrder: z.sortOrder,
          })),
          startDate: schedule.startDate,
          totalDuration: schedule.totalDuration,
          deviceId: deviceId,
          // Schedule timing
          scheduleJobTypes: schedule.scheduleJobTypes,
          summary: schedule.summary,
          startHour: schedule.startHour,
          startMinute: schedule.startMinute,
          operator: schedule.operator,
          startDay: schedule.startDay,
          startMonth: schedule.startMonth,
          startYear: schedule.startYear,
          interval,
          startTime,
          endDate: schedule.endDate || schedule.endDateTimestamp || null,
          // Cycle and soak
          cycleSoak: schedule.cycleSoak === true,
          cycleSoakStatus: schedule.cycleSoakStatus,
          cycles: schedule.cycles,
          totalDurationNoCycle: schedule.totalDurationNoCycle,
          // Weather intelligence
          rainDelay: schedule.rainDelay === true,
          waterBudget: schedule.waterBudget === true,
          weatherIntelligence: Object.keys(weatherIntelligence).length > 0 ? weatherIntelligence : undefined,
          weatherIntelligenceSensitivity: schedule.weatherIntelligenceSensitivity,
          seasonalAdjustment: schedule.seasonalAdjustment,
          // Other fields
          color: schedule.color || schedule.scheduleColor || null,
          repeat: schedule.repeat || schedule.repeatConfig || undefined,
          externalName: schedule.externalName,
        };
      });
      
      // Cache the result in static cache (shared across all instances)
      RachioClient.cachedSchedules.set(deviceId, {
        data: schedules,
        timestamp: Date.now(),
      });
      
      return schedules;
    } catch (error) {
      // Don't wrap RachioRateLimitError - let it propagate as-is
      if (error instanceof RachioRateLimitError) {
        throw error;
      }
      console.error(`Error fetching schedules for device ${deviceId}:`, error);
      throw new Error(`Failed to fetch schedules: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Enable a schedule
   * @param scheduleId Schedule ID
   */
  async enableSchedule(scheduleId: string): Promise<void> {
    try {
      await this.client.put(`/scheduleRule/${scheduleId}/enable`);
      console.log(`Enabled schedule ${scheduleId}`);
    } catch (error) {
      console.error(`Error enabling schedule ${scheduleId}:`, error);
      throw new Error(`Failed to enable schedule: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Start a schedule immediately
   * @param scheduleId Schedule ID
   */
  async startSchedule(scheduleId: string): Promise<void> {
    try {
      await this.client.put(`/schedulerule/${scheduleId}/start`);
      console.log(`Started schedule ${scheduleId}`);
    } catch (error) {
      console.error(`Error starting schedule ${scheduleId}:`, error);
      throw new Error(`Failed to start schedule: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Skip the next occurrence of a schedule
   * @param scheduleId Schedule ID
   */
  async skipSchedule(scheduleId: string): Promise<void> {
    try {
      await this.client.put(`/schedulerule/${scheduleId}/skip`);
      console.log(`Skipped schedule ${scheduleId}`);
    } catch (error) {
      console.error(`Error skipping schedule ${scheduleId}:`, error);
      throw new Error(`Failed to skip schedule: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

