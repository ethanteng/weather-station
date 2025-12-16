'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { weatherApi, rachioApi, automationApi, wateringApi, sensorApi, forecastApi, WeatherReading, WeatherSummary, RachioDevice, WateringEvent, AutomationRule, SoilMoistureSensor, Forecast16DayResponse, RachioZone } from '../lib/api';
import { WeatherCard } from '../components/WeatherCard';
import { RainfallChart } from '../components/RainfallChart';
import { WateringEventsTable } from '../components/WateringEventsTable';
import { Forecast7Day } from '../components/Forecast7Day';
import { ScheduleCalendar } from '../components/ScheduleCalendar';
import { Modal } from '../components/Modal';

export default function Dashboard() {
  const [latestWeather, setLatestWeather] = useState<WeatherReading | null>(null);
  const [weather24h, setWeather24h] = useState<WeatherSummary | null>(null);
  const [weather7d, setWeather7d] = useState<WeatherSummary | null>(null);
  const [forecast16d, setForecast16d] = useState<Forecast16DayResponse | null>(null);
  const [devices, setDevices] = useState<RachioDevice[]>([]);
  const [wateringEvents, setWateringEvents] = useState<WateringEvent[]>([]);
  const [automations, setAutomations] = useState<AutomationRule[]>([]);
  const [sensors, setSensors] = useState<SoilMoistureSensor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string>('');
  const [pollingRachio, setPollingRachio] = useState(false);
  const [rachioRateLimit, setRachioRateLimit] = useState<{
    rateLimited: boolean;
    resetTime: string | null;
    remaining?: number | null;
    limit?: number | null;
    message?: string;
  } | null>(null);
  const [modal, setModal] = useState<{
    isOpen: boolean;
    title?: string;
    message: string;
    type?: 'success' | 'error' | 'info';
  }>({
    isOpen: false,
    message: '',
    type: 'info',
  });

  // Simple auth prompt (Phase 1)
  useEffect(() => {
    const token = localStorage.getItem('authToken') || prompt('Enter admin password:');
    if (token) {
      localStorage.setItem('authToken', token);
      setAuthToken(token);
    }
  }, []);

  const fetchData = async () => {
    if (!authToken) return;

    try {
      setError(null);
      
      // Set auth token for API calls
      const { setAuthToken: setApiAuth } = await import('../lib/api');
      setApiAuth(authToken);

      const [latest, summary24h, summary7d, forecast16Day, rachioDevices, automationRulesResponse, events, sensorData] = await Promise.all([
        weatherApi.getLatest().catch(() => null),
        weatherApi.getSummary('24h').catch(() => null),
        weatherApi.getSummary('7d').catch(() => null),
        forecastApi.get16Day().catch(() => null),
        rachioApi.getDevices().catch(() => []),
        automationApi.getRules().catch(() => []),
        wateringApi.getEvents(10).catch(() => []),
        sensorApi.getSensors().catch(() => []),
      ]);

      setLatestWeather(latest);
      setWeather24h(summary24h);
      setWeather7d(summary7d);
      setForecast16d(forecast16Day);
      setDevices(rachioDevices);
      
      // Handle automation rules response (can be array or object with rateLimitError)
      if (Array.isArray(automationRulesResponse)) {
        setAutomations(automationRulesResponse);
      } else if (automationRulesResponse && typeof automationRulesResponse === 'object' && 'rules' in automationRulesResponse) {
        setAutomations((automationRulesResponse as any).rules || []);
        // Note: Rate limit info for dashboard is handled separately via getRateLimitStatus
      } else {
        setAutomations([]);
      }
      
      setWateringEvents(events);
      setSensors(sensorData.filter(s => s.enabled));

      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authToken) {
      fetchData();
      checkRachioRateLimit();
      // Refresh every 30 seconds
      const interval = setInterval(fetchData, 30000);
      // Check rate limit status every minute
      const rateLimitInterval = setInterval(checkRachioRateLimit, 60000);
      return () => {
        clearInterval(interval);
        clearInterval(rateLimitInterval);
      };
    }
  }, [authToken]);

  const checkRachioRateLimit = async () => {
    if (!authToken) return;
    try {
      const { setAuthToken: setApiAuth } = await import('../lib/api');
      setApiAuth(authToken);
      const status = await rachioApi.getRateLimitStatus();
      setRachioRateLimit(status);
    } catch (err) {
      // Silently fail - rate limit check is not critical
      console.error('Error checking rate limit status:', err);
    }
  };

  if (!authToken) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-slate-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center">
        <div className="max-w-md mx-auto px-4">
          <div className="bg-red-50 border-l-4 border-red-500 rounded-r-lg shadow-sm p-4">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p className="text-red-800 font-medium">Error: {error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const zoneMap: Record<string, string> = {};
  devices.forEach(device => {
    device.zones.forEach(zone => {
      zoneMap[zone.id] = zone.name;
    });
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1">
              <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">Home Weather Station</h1>
              <p className="text-slate-600 text-base sm:text-lg">Real-time weather monitoring and automated irrigation management</p>
              {/* Subtle API rate limit indicator */}
              {rachioRateLimit && 
               rachioRateLimit.remaining !== null && 
               rachioRateLimit.remaining !== undefined &&
               rachioRateLimit.limit !== null && 
               rachioRateLimit.limit !== undefined && (
                <div className="text-xs text-slate-400 mt-2">
                  <span className="font-mono">
                    {(rachioRateLimit.limit - rachioRateLimit.remaining).toLocaleString()}/{rachioRateLimit.limit.toLocaleString()}
                  </span>
                  <span className="ml-1 text-slate-500">API calls</span>
                </div>
              )}
            </div>
            <div className="flex gap-3 flex-wrap ml-auto">
              <Link
                href="/automations"
                className="inline-flex items-center px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg shadow-sm hover:bg-slate-50 hover:border-slate-400 transition-all duration-200 min-h-[44px]"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Automations
              </Link>
              <Link
                href="/sensors"
                className="inline-flex items-center px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg shadow-sm hover:bg-slate-50 hover:border-slate-400 transition-all duration-200 min-h-[44px]"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Manage Sensors
              </Link>
              <Link
                href="/history"
                className="inline-flex items-center px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg shadow-sm hover:bg-slate-50 hover:border-slate-400 transition-all duration-200 min-h-[44px]"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                History
              </Link>
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg shadow-sm">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p className="text-red-800 font-medium">{error}</p>
            </div>
          </div>
        )}

        {/* Rachio Rate Limit Info */}
        {rachioRateLimit?.rateLimited && (
          <div className="mb-6 p-4 bg-blue-50 border-l-4 border-blue-500 rounded-r-lg shadow-sm">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-blue-500 mr-3 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <p className="text-blue-800 font-medium mb-1">Rachio API Rate Limit Active</p>
                <p className="text-blue-700 text-sm">
                  {rachioRateLimit.resetTime ? (
                    <>
                      Rate limit will reset at{' '}
                      <span className="font-semibold">
                        {new Date(rachioRateLimit.resetTime).toLocaleString()}
                      </span>
                      {' '}({(() => {
                        const resetTime = new Date(rachioRateLimit.resetTime);
                        const now = new Date();
                        const msUntilReset = resetTime.getTime() - now.getTime();
                        const hoursUntilReset = Math.floor(msUntilReset / (1000 * 60 * 60));
                        const minutesUntilReset = Math.floor((msUntilReset % (1000 * 60 * 60)) / (1000 * 60));
                        if (hoursUntilReset > 0) {
                          return `${hoursUntilReset}h ${minutesUntilReset}m`;
                        }
                        return `${minutesUntilReset}m`;
                      })()} remaining)
                    </>
                  ) : (
                    rachioRateLimit.message || 'Please wait before making more requests.'
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 7-Day Forecast */}
        <Forecast7Day />

        {/* Current Weather Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <WeatherCard
            label="Temperature"
            value={latestWeather?.temperature || null}
            unit="°F"
            icon="🌡️"
            trendData={weather7d?.readings.map(r => ({
              timestamp: r.timestamp,
              value: r.temperature,
            }))}
          />
          <WeatherCard
            label="Humidity"
            value={latestWeather?.humidity || null}
            unit="%"
            icon="💧"
            trendData={weather7d?.readings.map(r => ({
              timestamp: r.timestamp,
              value: r.humidity,
            }))}
          />
          <WeatherCard
            label="Pressure"
            value={latestWeather?.pressure || null}
            unit="inHg"
            icon="📊"
            trendData={weather7d?.readings.map(r => ({
              timestamp: r.timestamp,
              value: r.pressure,
            }))}
          />
        </div>

        {/* Rainfall & Soil Moisture */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Rainfall Card */}
          <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden flex flex-col h-full">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 sm:px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <span className="text-xl sm:text-2xl">🌧️</span>
                <h2 className="text-lg sm:text-xl font-semibold text-white">Rainfall</h2>
              </div>
            </div>
            <div className="p-4 sm:p-6 flex flex-col flex-grow">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Last Hour</div>
                  <div className="text-xl sm:text-2xl font-bold text-blue-700">
                    {latestWeather && latestWeather.rain1h !== null ? `${latestWeather.rain1h.toFixed(2)}"` : 'N/A'}
                  </div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Last 24 Hours</div>
                  <div className="text-xl sm:text-2xl font-bold text-blue-700">
                    {latestWeather && latestWeather.rain24h !== null ? `${latestWeather.rain24h.toFixed(2)}"` : 'N/A'}
                  </div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Last 7 Days</div>
                  <div className="text-xl sm:text-2xl font-bold text-blue-700">
                    {weather7d && weather7d.totalRainfall !== null ? `${weather7d.totalRainfall.toFixed(2)}"` : 'N/A'}
                  </div>
                </div>
              </div>
              {weather24h && weather24h.readings.length > 0 && (
                <div className="mt-auto">
                  <RainfallChart data={weather24h.readings} />
                </div>
              )}
            </div>
          </div>

          {/* Soil Moisture Sensors */}
          <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden flex flex-col h-full">
            <div className="bg-gradient-to-r from-green-600 to-green-700 px-4 sm:px-6 py-4 border-b border-slate-200">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl sm:text-2xl">🌱</span>
                  <h2 className="text-lg sm:text-xl font-semibold text-white">Soil Moisture Sensors</h2>
                </div>
                <Link
                  href="/sensors"
                  className="text-sm text-white/90 hover:text-white underline min-h-[44px] flex items-center"
                >
                  Manage Sensors
                </Link>
              </div>
            </div>
            <div className="p-4 sm:p-6 flex flex-col flex-grow">
              {sensors.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sensors.map((sensor) => {
                    const channelKey = `soil_ch${sensor.channel}`;
                    const currentValue = latestWeather?.soilMoistureValues?.[channelKey] ?? sensor.currentValue;
                    return (
                      <div
                        key={sensor.id}
                        className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200 p-3"
                      >
                        <div className="text-center">
                          <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">
                            {sensor.name}
                          </div>
                          {currentValue !== null && currentValue !== undefined ? (
                            <>
                              <div className="text-xl sm:text-2xl font-bold text-green-700 mb-1">
                                {currentValue.toFixed(1)}%
                              </div>
                              <div className="flex items-center justify-center gap-1.5 mb-1">
                                <div className="w-full bg-slate-200 rounded-full h-1.5 max-w-[60px]">
                                  <div
                                    className="bg-gradient-to-r from-green-500 to-green-600 h-1.5 rounded-full transition-all duration-500"
                                    style={{ width: `${Math.min(100, Math.max(0, currentValue))}%` }}
                                  ></div>
                                </div>
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                  currentValue < 30 ? 'bg-red-100 text-red-700' :
                                  currentValue < 50 ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-green-100 text-green-700'
                                }`}>
                                  {currentValue < 30 ? 'Dry' : currentValue < 50 ? 'Moderate' : 'Wet'}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-500">Channel {sensor.channel}</div>
                            </>
                          ) : (
                            <div className="text-slate-400 italic text-xs">No data</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-slate-400 mb-2">No sensors configured</div>
                  <Link
                    href="/sensors"
                    className="text-sm text-blue-600 hover:text-blue-700 underline"
                  >
                    Go to Sensors page to configure
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Watering Events */}
        {wateringEvents.length > 0 && (
          <div className="mb-6">
            <WateringEventsTable events={wateringEvents} zones={zoneMap} />
          </div>
        )}

        {/* Schedule Calendar */}
        <div className="mb-6">
          <ScheduleCalendar
            automations={automations}
            forecast={forecast16d}
            onScheduleSkipped={() => {
              // Refresh automation rules after skipping
              fetchData();
            }}
          />
        </div>

        {/* Rachio Devices Status */}
        {devices.length > 0 && (
          <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
            <div className="bg-slate-800 px-4 sm:px-6 py-4 border-b border-slate-200">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-lg sm:text-xl font-semibold text-white">Rachio Devices</h2>
                <button
                  onClick={async () => {
                    if (pollingRachio || rachioRateLimit?.rateLimited) return;
                    setPollingRachio(true);
                    try {
                      await rachioApi.poll();
                      // Refresh data after poll
                      await fetchData();
                      await checkRachioRateLimit();
                      setModal({
                        isOpen: true,
                        message: 'Rachio data poll completed successfully',
                        type: 'success',
                      });
                    } catch (err: any) {
                      // Check if it's a rate limit error
                      if (err.response?.status === 429) {
                        const rateLimitData = err.response.data;
                        setRachioRateLimit({
                          rateLimited: true,
                          resetTime: rateLimitData.rateLimitReset || null,
                          remaining: rateLimitData.remaining,
                          limit: rateLimitData.limit,
                          message: rateLimitData.message,
                        });
                        setModal({
                          isOpen: true,
                          title: 'Rate Limit Exceeded',
                          message: rateLimitData.message || 'Please try again later.',
                          type: 'error',
                        });
                      } else {
                        setModal({
                          isOpen: true,
                          title: 'Poll Failed',
                          message: err instanceof Error ? err.message : 'Unknown error',
                          type: 'error',
                        });
                      }
                    } finally {
                      setPollingRachio(false);
                    }
                  }}
                  disabled={pollingRachio || rachioRateLimit?.rateLimited === true}
                  className="inline-flex items-center px-4 py-2.5 text-sm font-medium text-white bg-white/20 hover:bg-white/30 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                  title={rachioRateLimit?.rateLimited ? `Rate limited. ${rachioRateLimit.message || 'Please wait.'}` : "Manually refresh Rachio device and zone data"}
                >
                  {pollingRachio ? (
                    <>
                      <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Polling...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Refresh Rachio Data
                    </>
                  )}
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-6">
                {devices.map((device) => (
                  <div
                    key={device.id}
                    className="p-5 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-semibold text-slate-900 text-lg">{device.name}</span>
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium ${
                          device.status === 'ONLINE'
                            ? 'bg-green-100 text-green-800 border border-green-300'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {device.status === 'ONLINE' ? 'Online' : device.status}
                      </span>
                    </div>
                    {device.zones.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-200">
                        {(() => {
                          // Filter to only enabled zones and sort by name
                          const enabledZones = device.zones
                            .filter(zone => zone.enabled)
                            .sort((a, b) => a.name.localeCompare(b.name));
                          
                          return enabledZones.length > 0 ? (
                            <>
                              <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">
                                Active Zones ({enabledZones.length} of {device.zones.length})
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {enabledZones.map((zone) => (
                                  <ZoneCard key={zone.id} zone={zone} />
                                ))}
                              </div>
                            </>
                          ) : (
                            <div className="text-sm text-slate-500 italic">
                              No active zones ({device.zones.length} disabled)
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal
        isOpen={modal.isOpen}
        onClose={() => setModal({ ...modal, isOpen: false })}
        title={modal.title}
        message={modal.message}
        type={modal.type}
      />
    </div>
  );
}

function ZoneCard({ zone: initialZone }: { zone: RachioZone }) {
  const [expanded, setExpanded] = useState(false);
  const [zone, setZone] = useState<RachioZone>(initialZone);
  const [cooldownInput, setCooldownInput] = useState<string>(
    initialZone.cooldownPeriodDays !== null && initialZone.cooldownPeriodDays !== undefined
      ? initialZone.cooldownPeriodDays.toString()
      : ''
  );
  const [savingCooldown, setSavingCooldown] = useState(false);
  const [cooldownError, setCooldownError] = useState<string | null>(null);
  const [cooldownSuccess, setCooldownSuccess] = useState(false);

  // Update local state when prop changes
  useEffect(() => {
    setZone(initialZone);
    setCooldownInput(
      initialZone.cooldownPeriodDays !== null && initialZone.cooldownPeriodDays !== undefined
        ? initialZone.cooldownPeriodDays.toString()
        : ''
    );
  }, [initialZone]);

  const handleSaveCooldown = async () => {
    setSavingCooldown(true);
    setCooldownError(null);
    setCooldownSuccess(false);

    try {
      // Parse input value
      const value = cooldownInput.trim() === '' ? null : parseInt(cooldownInput, 10);
      
      // Validate
      if (value !== null && (isNaN(value) || value < 0)) {
        setCooldownError('Cooldown period must be a non-negative number');
        setSavingCooldown(false);
        return;
      }

      // Update via API
      await rachioApi.updateZoneCooldown(zone.id, value);
      
      // Update local state
      setZone({ ...zone, cooldownPeriodDays: value });
      setCooldownSuccess(true);
      
      // Clear success message after 2 seconds
      setTimeout(() => setCooldownSuccess(false), 2000);
    } catch (error) {
      setCooldownError(error instanceof Error ? error.message : 'Failed to update cooldown period');
    } finally {
      setSavingCooldown(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
      {/* Zone Header */}
      <div
        className="p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {zone.zoneNumber && (
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
                {zone.zoneNumber}
              </span>
            )}
            <span className="font-semibold text-slate-900">{zone.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                zone.enabled
                  ? 'bg-green-100 text-green-800 border border-green-300'
                  : 'bg-slate-50 text-slate-500 border border-slate-200'
              }`}
            >
              {zone.enabled ? 'Enabled' : 'Disabled'}
            </span>
            <svg
              className={`w-4 h-4 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        {zone.imageUrl && (
          <div className="mt-2 rounded overflow-hidden bg-slate-100">
            <img
              src={zone.imageUrl}
              alt={zone.name}
              className="w-full h-32 object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-200 bg-slate-50">
          <div className="pt-3 space-y-2">
            {zone.area && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Area:</span>
                <span className="font-medium text-slate-900">{zone.area.toLocaleString()} sq ft</span>
              </div>
            )}
            {zone.rootZoneDepth && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Root Zone Depth:</span>
                <span className="font-medium text-slate-900">{zone.rootZoneDepth}"</span>
              </div>
            )}
            {zone.availableWater !== null && zone.availableWater !== undefined && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Available Water:</span>
                <span className="font-medium text-slate-900">{zone.availableWater.toFixed(2)}"</span>
              </div>
            )}
            {zone.maxRuntime && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Max Runtime:</span>
                <span className="font-medium text-slate-900">{zone.maxRuntime} min</span>
              </div>
            )}
            {zone.runtime && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Runtime:</span>
                <span className="font-medium text-slate-900">{zone.runtime} min</span>
              </div>
            )}
            {/* Cooldown Period */}
            <div className="mt-3 pt-3 border-t border-slate-200">
              <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Cooldown Period</div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={cooldownInput}
                    onChange={(e) => {
                      setCooldownInput(e.target.value);
                      setCooldownError(null);
                      setCooldownSuccess(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveCooldown();
                      }
                    }}
                    className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Days (leave empty for no cooldown)"
                  />
                  <button
                    onClick={handleSaveCooldown}
                    disabled={savingCooldown}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingCooldown ? (
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      'Save'
                    )}
                  </button>
                </div>
                {cooldownError && (
                  <div className="text-xs text-red-600">{cooldownError}</div>
                )}
                {cooldownSuccess && (
                  <div className="text-xs text-green-600">Cooldown period updated successfully</div>
                )}
                <div className="text-xs text-slate-500">
                  Current: {zone.cooldownPeriodDays !== null && zone.cooldownPeriodDays !== undefined
                    ? `${zone.cooldownPeriodDays} day${zone.cooldownPeriodDays !== 1 ? 's' : ''}`
                    : 'None'}
                </div>
              </div>
            </div>

            {(zone.customNozzle || zone.customShade || zone.customSlope || zone.customCrop || zone.customSoil) && (
              <div className="mt-3 pt-3 border-t border-slate-200">
                <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Custom Settings</div>
                <div className="space-y-1">
                  {zone.customNozzle && (
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Nozzle:</span>
                      <span className="font-medium text-slate-700">{zone.customNozzle}</span>
                    </div>
                  )}
                  {zone.customShade && (
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Shade:</span>
                      <span className="font-medium text-slate-700">{zone.customShade}</span>
                    </div>
                  )}
                  {zone.customSlope && (
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Slope:</span>
                      <span className="font-medium text-slate-700">{zone.customSlope}</span>
                    </div>
                  )}
                  {zone.customCrop && (
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Crop:</span>
                      <span className="font-medium text-slate-700">{zone.customCrop}</span>
                    </div>
                  )}
                  {zone.customSoil && (
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Soil:</span>
                      <span className="font-medium text-slate-700">{zone.customSoil}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
