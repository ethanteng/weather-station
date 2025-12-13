'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { weatherApi, rachioApi, automationApi, wateringApi, WeatherReading, WeatherSummary, RachioDevice, WateringEvent } from '../lib/api';
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
  const [automations, setAutomations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string>('');

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

      const [latest, summary24h, summary7d, rachioDevices, automationRules, events] = await Promise.all([
        weatherApi.getLatest().catch(() => null),
        weatherApi.getSummary('24h').catch(() => null),
        weatherApi.getSummary('7d').catch(() => null),
        rachioApi.getDevices().catch(() => []),
        automationApi.getRules().catch(() => []),
        wateringApi.getEvents(10).catch(() => []),
      ]);

      setLatestWeather(latest);
      setWeather24h(summary24h);
      setWeather7d(summary7d);
      setDevices(rachioDevices);
      setAutomations(automationRules);
      setWateringEvents(events);

      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authToken) {
      fetchData();
      // Refresh every 30 seconds
      const interval = setInterval(fetchData, 30000);
      return () => clearInterval(interval);
    }
  }, [authToken]);

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
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Weather → Irrigation Control</h1>
          <p className="text-slate-600 text-lg">Real-time weather monitoring and automated irrigation management</p>
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

        {/* 7-Day Forecast */}
        <Forecast7Day />

        {/* Current Weather Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <WeatherCard
            label="Temperature"
            value={latestWeather?.temperature || null}
            unit="°F"
            icon="🌡️"
          />
          <WeatherCard
            label="Humidity"
            value={latestWeather?.humidity || null}
            unit="%"
            icon="💨"
          />
          <WeatherCard
            label="Pressure"
            value={latestWeather?.pressure || null}
            unit=" hPa"
            icon="📊"
          />
        </div>

        {/* Rainfall & Soil Moisture */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Rainfall Card */}
          <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🌧️</span>
                <h2 className="text-xl font-semibold text-white">Rainfall</h2>
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Last Hour</div>
                  <div className="text-2xl font-bold text-blue-700">
                    {latestWeather && latestWeather.rain1h !== null ? `${latestWeather.rain1h.toFixed(2)}"` : 'N/A'}
                  </div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Last 24 Hours</div>
                  <div className="text-2xl font-bold text-blue-700">
                    {latestWeather && latestWeather.rain24h !== null ? `${latestWeather.rain24h.toFixed(2)}"` : 'N/A'}
                  </div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Last 7 Days</div>
                  <div className="text-2xl font-bold text-blue-700">
                    {weather7d && weather7d.totalRainfall !== null ? `${weather7d.totalRainfall.toFixed(2)}"` : 'N/A'}
                  </div>
                </div>
              </div>
              {weather24h && weather24h.readings.length > 0 && (
                <RainfallChart data={weather24h.readings} />
              )}
            </div>
          </div>

          {/* Soil Moisture Card */}
          <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🌱</span>
                <h2 className="text-xl font-semibold text-white">Soil Moisture</h2>
              </div>
            </div>
            <div className="p-6">
              <div className="text-center p-6 bg-green-50 rounded-lg border border-green-100 mb-6">
                <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Current Level</div>
                <div className="text-4xl font-bold text-green-700 mb-2">
                  {latestWeather && latestWeather.soilMoisture !== null ? `${latestWeather.soilMoisture.toFixed(1)}%` : 'N/A'}
                </div>
                {latestWeather && latestWeather.soilMoisture !== null && (
                  <div className="w-full bg-slate-200 rounded-full h-3 mt-4">
                    <div
                      className="bg-gradient-to-r from-green-500 to-green-600 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, latestWeather.soilMoisture))}%` }}
                    ></div>
                  </div>
                )}
              </div>
              {weather24h && weather24h.readings.length > 0 && (
                <SoilMoistureChart data={weather24h.readings} />
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
          <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">⚙️</span>
                <h2 className="text-xl font-semibold text-white">Automation Rules</h2>
              </div>
              <Link
                href="/automations"
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-white/20 hover:bg-white/30 rounded-lg transition-all duration-200"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Manage Rules
              </Link>
            </div>
          </div>
          <div className="p-6">
            {automations.length > 0 ? (
              <div className="space-y-3">
                {automations.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                          rule.enabled
                            ? 'bg-green-100 text-green-800 border border-green-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {rule.enabled ? (
                          <>
                            <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                            Enabled
                          </>
                        ) : (
                          <>
                            <span className="w-2 h-2 bg-slate-400 rounded-full mr-2"></span>
                            Disabled
                          </>
                        )}
                      </span>
                      <span className="font-semibold text-slate-900">{rule.name}</span>
                    </div>
                  </div>
                ))}
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
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🚿</span>
                <h2 className="text-xl font-semibold text-white">Rachio Devices</h2>
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
                      <div className="flex items-center gap-3">
                        <span className="text-xl">📡</span>
                        <span className="font-semibold text-slate-900 text-lg">{device.name}</span>
                      </div>
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                          device.status === 'ONLINE'
                            ? 'bg-green-100 text-green-800 border border-green-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {device.status === 'ONLINE' ? (
                          <>
                            <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                            Online
                          </>
                        ) : (
                          <>
                            <span className="w-2 h-2 bg-amber-500 rounded-full mr-2"></span>
                            {device.status}
                          </>
                        )}
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
                  ? 'bg-green-100 text-green-800'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {zone.enabled ? '✓' : '✗'}
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
