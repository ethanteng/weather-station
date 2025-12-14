'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { weatherApi, rachioApi, automationApi, wateringApi, sensorApi, WeatherReading, WeatherSummary, RachioDevice, WateringEvent, AutomationRule, SoilMoistureSensor } from '../lib/api';
import { WeatherCard } from '../components/WeatherCard';
import { RainfallChart } from '../components/RainfallChart';
import { SoilMoistureChart } from '../components/SoilMoistureChart';
import { WateringEventsTable } from '../components/WateringEventsTable';
import { Forecast7Day } from '../components/Forecast7Day';
import { RachioZone } from '../lib/api';

export default function Dashboard() {
  const [latestWeather, setLatestWeather] = useState<WeatherReading | null>(null);
  const [weather24h, setWeather24h] = useState<WeatherSummary | null>(null);
  const [weather7d, setWeather7d] = useState<WeatherSummary | null>(null);
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
    message?: string;
  } | null>(null);

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

      const [latest, summary24h, summary7d, rachioDevices, automationRulesResponse, events, sensorData] = await Promise.all([
        weatherApi.getLatest().catch(() => null),
        weatherApi.getSummary('24h').catch(() => null),
        weatherApi.getSummary('7d').catch(() => null),
        rachioApi.getDevices().catch(() => []),
        automationApi.getRules().catch(() => []),
        wateringApi.getEvents(10).catch(() => []),
        sensorApi.getSensors().catch(() => []),
      ]);

      setLatestWeather(latest);
      setWeather24h(summary24h);
      setWeather7d(summary7d);
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
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">Home Weather Station</h1>
          <p className="text-slate-600 text-base sm:text-lg">Real-time weather monitoring and automated irrigation management</p>
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
          />
          <WeatherCard
            label="Humidity"
            value={latestWeather?.humidity || null}
            unit="%"
          />
          <WeatherCard
            label="Pressure"
            value={latestWeather?.pressure || null}
            unit=" hPa"
          />
        </div>

        {/* Rainfall & Soil Moisture */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Rainfall Card */}
          <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
            <div className="bg-slate-800 px-4 sm:px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg sm:text-xl font-semibold text-white">Rainfall</h2>
            </div>
            <div className="p-4 sm:p-6">
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
                <RainfallChart data={weather24h.readings} />
              )}
            </div>
          </div>

          {/* Soil Moisture Sensors */}
          <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
            <div className="bg-slate-800 px-4 sm:px-6 py-4 border-b border-slate-200">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-lg sm:text-xl font-semibold text-white">Soil Moisture Sensors</h2>
                <Link
                  href="/sensors"
                  className="text-sm text-white/90 hover:text-white underline min-h-[44px] flex items-center"
                >
                  Manage Sensors
                </Link>
              </div>
            </div>
            <div className="p-6">
              {sensors.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sensors.map((sensor) => {
                    const channelKey = `soil_ch${sensor.channel}`;
                    const currentValue = latestWeather?.soilMoistureValues?.[channelKey] ?? sensor.currentValue;
                    return (
                      <div
                        key={sensor.id}
                        className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200 p-4"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h3 className="text-sm font-semibold text-slate-900">{sensor.name}</h3>
                            <p className="text-xs text-slate-600">Channel {sensor.channel}</p>
                          </div>
                          {currentValue !== null && currentValue !== undefined && (
                            <div className={`px-2 py-1 rounded text-xs font-bold ${
                              currentValue < 30 ? 'bg-red-100 text-red-700' :
                              currentValue < 50 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {currentValue < 30 ? 'Dry' : currentValue < 50 ? 'Moderate' : 'Wet'}
                            </div>
                          )}
                        </div>
                        {currentValue !== null && currentValue !== undefined ? (
                          <>
                            <div className="text-3xl font-bold text-green-700 mb-2">
                              {currentValue.toFixed(1)}%
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-2">
                              <div
                                className="bg-gradient-to-r from-green-500 to-green-600 h-2 rounded-full transition-all duration-500"
                                style={{ width: `${Math.min(100, Math.max(0, currentValue))}%` }}
                              ></div>
                            </div>
                          </>
                        ) : (
                          <div className="text-slate-400 italic text-sm">No data available</div>
                        )}
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
              {sensors.length > 0 && weather24h && weather24h.readings.length > 0 && (
                <div className="mt-6">
                  <SoilMoistureChart data={weather24h.readings} />
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

        {/* Automation Rules */}
        <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden mb-6">
            <div className="bg-slate-800 px-4 sm:px-6 py-4 border-b border-slate-200">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg sm:text-xl font-semibold text-white">Automation Rules</h2>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={async () => {
                    if (pollingRachio || rachioRateLimit?.rateLimited) return;
                    setPollingRachio(true);
                    try {
                      await rachioApi.poll();
                      // Refresh data after poll
                      await fetchData();
                      await checkRachioRateLimit();
                      alert('Rachio data poll completed successfully');
                    } catch (err: any) {
                      // Check if it's a rate limit error
                      if (err.response?.status === 429) {
                        const rateLimitData = err.response.data;
                        setRachioRateLimit({
                          rateLimited: true,
                          resetTime: rateLimitData.rateLimitReset || null,
                          message: rateLimitData.message,
                        });
                        alert(`Rate limit exceeded. ${rateLimitData.message || 'Please try again later.'}`);
                      } else {
                        alert(`Failed to poll Rachio data: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
                <Link
                  href="/automations"
                  className="inline-flex items-center px-4 py-2.5 text-sm font-medium text-white bg-white/20 hover:bg-white/30 rounded-lg transition-all duration-200 min-h-[44px]"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Manage Rules
                </Link>
              </div>
            </div>
          </div>
          <div className="p-6">
            {automations.length > 0 ? (
              <div className="space-y-6">
                {/* Custom Rules Section */}
                {automations.filter(r => r.source !== 'rachio').length > 0 && (
                  <div>
                    <div className="mb-3">
                      <h3 className="text-lg font-semibold text-slate-800">Custom Automation Rules</h3>
                      <p className="text-xs text-slate-500 mt-1">Rules configured in this app</p>
                    </div>
                    <div className="space-y-2">
                      {automations
                        .filter(r => r.source !== 'rachio')
                        .map((rule) => (
                          <div
                            key={rule.id}
                            className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium ${
                                  rule.enabled
                                    ? 'bg-slate-100 text-slate-700 border border-slate-300'
                                    : 'bg-slate-50 text-slate-500 border border-slate-200'
                                }`}
                              >
                                {rule.enabled ? 'Enabled' : 'Disabled'}
                              </span>
                              <span className="font-semibold text-slate-900">{rule.name}</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Rachio Schedules Section */}
                {automations.filter(r => r.source === 'rachio').length > 0 && (
                  <div>
                    <div className="mb-3">
                      <h3 className="text-lg font-semibold text-slate-800">Rachio Schedules</h3>
                      <p className="text-xs text-slate-500 mt-1">Schedules configured in the Rachio app</p>
                    </div>
                    {(() => {
                      // Group Rachio schedules by device name
                      const rachioRules = automations.filter(r => r.source === 'rachio');
                      const groupedByDevice = rachioRules.reduce((acc, rule) => {
                        const deviceName = rule.deviceName || 'Unknown Device';
                        if (!acc[deviceName]) {
                          acc[deviceName] = [];
                        }
                        acc[deviceName].push(rule);
                        return acc;
                      }, {} as Record<string, AutomationRule[]>);

                      // Sort device names (frontyard/backyard first if they exist)
                      const deviceNames = Object.keys(groupedByDevice).sort((a, b) => {
                        const aLower = a.toLowerCase();
                        const bLower = b.toLowerCase();
                        if (aLower.includes('front') && !bLower.includes('front')) return -1;
                        if (!aLower.includes('front') && bLower.includes('front')) return 1;
                        if (aLower.includes('back') && !bLower.includes('back')) return -1;
                        if (!aLower.includes('back') && bLower.includes('back')) return 1;
                        return a.localeCompare(b);
                      });

                      return (
                        <div className="space-y-4">
                          {deviceNames.map((deviceName) => (
                            <div key={deviceName}>
                              <div className="mb-2 flex items-center gap-2">
                                <span className="inline-flex items-center px-3 py-1 rounded-lg text-sm font-bold bg-indigo-100 text-indigo-900 border border-indigo-300">
                                  <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                                  </svg>
                                  {deviceName}
                                </span>
                                <span className="text-xs text-slate-500">
                                  ({groupedByDevice[deviceName].length} schedule{groupedByDevice[deviceName].length !== 1 ? 's' : ''})
                                </span>
                              </div>
                              <div className="space-y-2 ml-2">
                                {groupedByDevice[deviceName].map((rule) => (
                                  <div
                                    key={rule.id}
                                    className="flex items-center justify-between p-3 bg-indigo-50/50 rounded-lg border border-indigo-100 hover:bg-indigo-50 transition-colors"
                                  >
                                    <div className="flex items-center gap-3">
                                      <span
                                        className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium ${
                                          rule.enabled
                                            ? 'bg-slate-100 text-slate-700 border border-slate-300'
                                            : 'bg-slate-50 text-slate-500 border border-slate-200'
                                        }`}
                                      >
                                        {rule.enabled ? 'Enabled' : 'Disabled'}
                                      </span>
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-300">
                                        Rachio
                                      </span>
                                      <span className="font-semibold text-slate-900">{rule.name}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <svg className="w-12 h-12 mx-auto text-slate-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <p className="text-slate-600">No automation rules found.</p>
                <Link
                  href="/automations"
                  className="inline-flex items-center mt-4 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-all"
                >
                  Create Your First Rule
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Rachio Devices Status */}
        {devices.length > 0 && (
          <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
            <div className="bg-slate-800 px-4 sm:px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg sm:text-xl font-semibold text-white">Rachio Devices</h2>
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
                            ? 'bg-slate-100 text-slate-700 border border-slate-300'
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
    </div>
  );
}

function ZoneCard({ zone }: { zone: RachioZone }) {
  const [expanded, setExpanded] = useState(false);

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
                  ? 'bg-slate-100 text-slate-700 border border-slate-300'
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
