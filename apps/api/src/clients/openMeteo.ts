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

interface OpenMeteoDailyResponse {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_probability_max: number[];
  precipitation_sum: number[];
  wind_speed_10m_max?: number[];
}

interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  daily: OpenMeteoDailyResponse;
}

export class OpenMeteoClient {
  private baseUrl = 'https://api.open-meteo.com/v1/forecast';

  /**
   * Fetch 7-day forecast from Open-Meteo API
   */
  async get7DayForecast(latitude: number, longitude: number): Promise<Forecast7DayResponse> {
    try {
      const url = new URL(this.baseUrl);
      url.searchParams.set('latitude', latitude.toString());
      url.searchParams.set('longitude', longitude.toString());
      url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max');
      url.searchParams.set('timezone', 'auto');

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Open-Meteo API returned ${response.status}: ${response.statusText}`);
      }

      const data: OpenMeteoResponse = await response.json();

      // Validate response structure
      if (!data.daily || !data.daily.time || data.daily.time.length === 0) {
        throw new Error('Invalid response structure from Open-Meteo API');
      }

      // Normalize to our format
      const days: DailyForecast[] = [];
      const daily = data.daily;
      const dayCount = Math.min(7, daily.time.length);

      for (let i = 0; i < dayCount; i++) {
        const tempMax = daily.temperature_2m_max[i];
        const tempMin = daily.temperature_2m_min[i];
        
        if (tempMax === null || tempMax === undefined || tempMin === null || tempMin === undefined) {
          throw new Error(`Missing temperature data for day ${i + 1}`);
        }

        days.push({
          date: daily.time[i],
          tempMaxC: tempMax,
          tempMinC: tempMin,
          precipProbMax: daily.precipitation_probability_max[i] ?? 0,
          precipSumMm: daily.precipitation_sum[i] ?? 0,
          windMaxKph: daily.wind_speed_10m_max?.[i],
        });
      }

      // Ensure we have exactly 7 days
      if (days.length < 7) {
        throw new Error(`Expected 7 days of forecast data, got ${days.length}`);
      }

      return {
        latitude: data.latitude,
        longitude: data.longitude,
        timezone: data.timezone,
        generatedAt: new Date().toISOString(),
        days: days.slice(0, 7),
      };
    } catch (error) {
      console.error('Error fetching forecast from Open-Meteo:', error);
      throw new Error(
        `Failed to fetch forecast: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
