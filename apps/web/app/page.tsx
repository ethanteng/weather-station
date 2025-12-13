'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { weatherApi, rachioApi, automationApi, wateringApi, WeatherReading, WeatherSummary, RachioDevice, WateringEvent } from '../lib/api';
import { WeatherCard } from '../components/WeatherCard';
import { RainfallChart } from '../components/RainfallChart';
import { SoilMoistureChart } from '../components/SoilMoistureChart';
import { WateringEventsTable } from '../components/WateringEventsTable';

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
    return <div className="container">Loading...</div>;
  }

  if (loading) {
    return <div className="container">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="container">Error: {error}</div>;
  }

  const zoneMap: Record<string, string> = {};
  devices.forEach(device => {
    device.zones.forEach(zone => {
      zoneMap[zone.id] = zone.name;
    });
  });

  return (
    <div className="container">
      <h1 style={{ marginBottom: '30px', fontSize: '2rem' }}>Weather → Irrigation Control</h1>

      {/* Current Weather */}
      <div className="grid grid-3">
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

      {/* Rainfall Stats */}
      <div className="grid grid-2">
        <div className="card">
          <h2>Rainfall</h2>
          <div className="stat">
            <div className="stat-label">Last Hour</div>
            <div className="stat-value">
              {latestWeather && latestWeather.rain1h !== null ? `${latestWeather.rain1h.toFixed(2)}"` : 'N/A'}
            </div>
          </div>
          <div className="stat" style={{ marginTop: '15px' }}>
            <div className="stat-label">Last 24 Hours</div>
            <div className="stat-value">
              {latestWeather && latestWeather.rain24h !== null ? `${latestWeather.rain24h.toFixed(2)}"` : 'N/A'}
            </div>
          </div>
          <div className="stat" style={{ marginTop: '15px' }}>
            <div className="stat-label">Last 7 Days</div>
            <div className="stat-value">
              {weather7d && weather7d.totalRainfall !== null ? `${weather7d.totalRainfall.toFixed(2)}"` : 'N/A'}
            </div>
          </div>
          {weather24h && weather24h.readings.length > 0 && (
            <RainfallChart data={weather24h.readings} />
          )}
        </div>

        {/* Soil Moisture */}
        <div className="card">
          <h2>Soil Moisture</h2>
          <div className="stat">
            <div className="stat-label">Current</div>
            <div className="stat-value">
              {latestWeather && latestWeather.soilMoisture !== null ? `${latestWeather.soilMoisture.toFixed(1)}%` : 'N/A'}
            </div>
          </div>
          {weather24h && weather24h.readings.length > 0 && (
            <SoilMoistureChart data={weather24h.readings} />
          )}
        </div>
      </div>

      {/* Watering Events */}
      {wateringEvents.length > 0 && (
        <WateringEventsTable events={wateringEvents} zones={zoneMap} />
      )}

      {/* Automation Rules */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h2>Automation Rules</h2>
          <Link
            href="/automations"
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            style={{ textDecoration: 'none' }}
          >
            Manage Rules
          </Link>
        </div>
        {automations.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {automations.map((rule) => (
              <li key={rule.id} style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
                <strong>{rule.name}</strong> - {rule.enabled ? '✓ Enabled' : '✗ Disabled'}
              </li>
            ))}
          </ul>
        ) : (
          <p>No automation rules found.</p>
        )}
      </div>

      {/* Rachio Devices Status */}
      {devices.length > 0 && (
        <div className="card">
          <h2>Rachio Devices</h2>
          {devices.map((device) => (
            <div key={device.id} style={{ marginBottom: '15px', paddingBottom: '15px', borderBottom: '1px solid #eee' }}>
              <strong>{device.name}</strong> - Status: {device.status}
              {device.zones.length > 0 && (
                <div style={{ marginTop: '5px', fontSize: '0.9rem', color: '#666' }}>
                  Zones: {device.zones.map(z => z.name).join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

