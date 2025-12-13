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
  duration: number;
  sortOrder: number;
}

export interface RachioSchedule {
  id: string;
  name: string;
  enabled: boolean;
  zones: RachioScheduleZone[];
  startDate?: number;
  totalDuration?: number;
  deviceId: string;
  [key: string]: unknown;
}

export class RachioClient {
  private client: AxiosInstance;

  constructor(apiKey: string) {

    this.client = axios.create({
      baseURL: 'https://api.rach.io/1/public',
      timeout: 10000,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get person information (authenticated user)
   */
  async getPerson(): Promise<RachioPerson> {
    try {
      const response = await this.client.get('/person/info');
      console.log('Rachio person response:', JSON.stringify(response.data, null, 2));
      return response.data;
    } catch (error) {
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
    try {
      const response = await this.client.get(`/device/${deviceId}`);
      const scheduleRules = response.data?.scheduleRules || [];
      
      return scheduleRules.map((schedule: any) => ({
        id: schedule.id,
        name: schedule.name || 'Unnamed Schedule',
        enabled: schedule.enabled !== false,
        zones: schedule.zones || [],
        startDate: schedule.startDate,
        totalDuration: schedule.totalDuration,
        deviceId: deviceId,
      }));
    } catch (error) {
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
   * Disable a schedule
   * @param scheduleId Schedule ID
   */
  async disableSchedule(scheduleId: string): Promise<void> {
    try {
      await this.client.put(`/scheduleRule/${scheduleId}/disable`);
      console.log(`Disabled schedule ${scheduleId}`);
    } catch (error) {
      console.error(`Error disabling schedule ${scheduleId}:`, error);
      throw new Error(`Failed to disable schedule: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

