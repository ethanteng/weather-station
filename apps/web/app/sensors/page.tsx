'use client';

import { useEffect, useState } from 'react';
import { sensorApi, SoilMoistureSensor } from '../../lib/api';
import Link from 'next/link';

export default function SensorsPage() {
  const [sensors, setSensors] = useState<SoilMoistureSensor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [authToken, setAuthToken] = useState<string>('');

  useEffect(() => {
    const token = localStorage.getItem('authToken') || prompt('Enter admin password:');
    if (token) {
      localStorage.setItem('authToken', token);
      setAuthToken(token);
    }
  }, []);

  useEffect(() => {
    if (authToken) {
      fetchSensors();
    }
  }, [authToken]);

  const fetchSensors = async () => {
    if (!authToken) return;

    try {
      setError(null);
      const { setAuthToken: setApiAuth } = await import('../../lib/api');
      setApiAuth(authToken);

      const data = await sensorApi.getSensors();
      setSensors(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sensors');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveName = async (id: string) => {
    try {
      await sensorApi.updateSensor(id, { name: editingName });
      setEditingId(null);
      setEditingName('');
      await fetchSensors();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update sensor name');
    }
  };

  const handleToggleEnabled = async (id: string, enabled: boolean) => {
    try {
      await sensorApi.updateSensor(id, { enabled });
      await fetchSensors();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update sensor');
    }
  };

  const handleStartEdit = (sensor: SoilMoistureSensor) => {
    setEditingId(sensor.id);
    setEditingName(sensor.name);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-slate-600">Loading sensors...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">Soil Moisture Sensors</h1>
              <p className="text-slate-600 text-base sm:text-lg">Manage and name your soil moisture sensors</p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/"
                className="inline-flex items-center px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg shadow-sm hover:bg-slate-50 hover:border-slate-400 transition-all duration-200 min-h-[44px]"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Dashboard
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

        {/* Sensors List */}
        {sensors.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sensors.map((sensor) => (
              <div
                key={sensor.id}
                className={`bg-white rounded-xl shadow-md border transition-all duration-200 hover:shadow-lg ${
                  sensor.enabled ? 'border-green-200' : 'border-slate-200 opacity-75'
                }`}
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      {editingId === sensor.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Sensor name"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveName(sensor.id);
                              } else if (e.key === 'Escape') {
                                handleCancelEdit();
                              }
                            }}
                          />
                          <button
                            onClick={() => handleSaveName(sensor.id)}
                            className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="px-3 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900 mb-1">{sensor.name}</h3>
                          <p className="text-sm text-slate-500">Channel {sensor.channel}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sensor.enabled}
                          onChange={(e) => handleToggleEnabled(sensor.id, e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                      </label>
                    </div>
                  </div>

                  {/* Current Value */}
                  <div className="mb-4">
                    <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Current Value</div>
                    {sensor.currentValue !== null && sensor.currentValue !== undefined ? (
                      <div>
                        <div className="text-3xl font-bold text-green-700 mb-2">
                          {sensor.currentValue.toFixed(1)}%
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-3">
                          <div
                            className="bg-gradient-to-r from-green-500 to-green-600 h-3 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(0, sensor.currentValue))}%` }}
                          ></div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-slate-400 italic">No data available</div>
                    )}
                  </div>

                  {/* Last Reading */}
                  {sensor.lastReadingAt && (
                    <div className="text-xs text-slate-500 mb-4">
                      Last reading: {new Date(sensor.lastReadingAt).toLocaleString()}
                    </div>
                  )}

                  {/* Actions */}
                  {editingId !== sensor.id && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleStartEdit(sensor)}
                        className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors min-h-[44px]"
                      >
                        Edit Name
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-xl shadow-md border border-slate-200">
            <svg className="w-16 h-16 mx-auto text-slate-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <h3 className="text-xl font-semibold text-slate-900 mb-2">No Sensors Found</h3>
            <p className="text-slate-600 mb-6 max-w-md mx-auto">
              Sensors will be automatically detected when weather data is polled. Make sure your Ecowitt device is connected and the weather polling job is running.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
