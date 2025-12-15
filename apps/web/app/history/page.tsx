'use client';

import { useEffect, useState } from 'react';
import { automationApi, AutomationHistoryEntry } from '../../lib/api';
import Link from 'next/link';

export default function HistoryPage() {
  const [entries, setEntries] = useState<AutomationHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'automation' | 'schedule'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [authToken, setAuthToken] = useState<string>('');

  useEffect(() => {
    const token = localStorage.getItem('authToken') || prompt('Enter admin password:');
    if (token) {
      localStorage.setItem('authToken', token);
      setAuthToken(token);
    }
  }, []);

  useEffect(() => {
    if (!authToken) return;

    const fetchHistory = async () => {
      try {
        setError(null);
        const { setAuthToken: setApiAuth } = await import('../../lib/api');
        setApiAuth(authToken);

        const response = await automationApi.getHistory(200, 0);
        setEntries(response.entries);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load history');
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [authToken]);

  // Group entries by date
  const groupedEntries = entries.reduce((acc, entry) => {
    const date = new Date(entry.timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(entry);
    return acc;
  }, {} as Record<string, AutomationHistoryEntry[]>);

  // Filter entries
  const filteredEntries = Object.entries(groupedEntries).reduce((acc, [date, dateEntries]) => {
    const filtered = dateEntries.filter(entry => {
      // Type filter
      if (filterType !== 'all' && entry.type !== filterType) {
        return false;
      }
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          entry.name.toLowerCase().includes(query) ||
          entry.deviceName?.toLowerCase().includes(query) ||
          entry.action.toLowerCase().includes(query)
        );
      }
      return true;
    });

    if (filtered.length > 0) {
      acc[date] = filtered;
    }
    return acc;
  }, {} as Record<string, AutomationHistoryEntry[]>);

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatDuration = (minutes: number | null | undefined) => {
    if (!minutes) return null;
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-slate-600">Loading history...</p>
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
              <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">Automation History</h1>
              <p className="text-slate-600 text-base sm:text-lg">View all automation runs and schedule executions</p>
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
              <Link
                href="/automations"
                className="inline-flex items-center px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg shadow-sm hover:bg-slate-50 hover:border-slate-400 transition-all duration-200 min-h-[44px]"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Automations
              </Link>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 bg-white rounded-xl shadow-md border border-slate-200 p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-2">Search</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, device, or action..."
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="sm:w-48">
              <label className="block text-sm font-medium text-slate-700 mb-2">Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as 'all' | 'automation' | 'schedule')}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Types</option>
                <option value="automation">Automations</option>
                <option value="schedule">Schedules</option>
              </select>
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

        {/* History Entries */}
        {Object.keys(filteredEntries).length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl shadow-md border border-slate-200">
            <svg className="w-16 h-16 mx-auto text-slate-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-xl font-semibold text-slate-900 mb-2">No History Found</h3>
            <p className="text-slate-600">
              {searchQuery || filterType !== 'all'
                ? 'No entries match your filters. Try adjusting your search criteria.'
                : 'No automation runs or schedule executions have been recorded yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(filteredEntries).map(([date, dateEntries]) => (
              <div key={date}>
                <h2 className="text-2xl font-bold text-slate-900 mb-4">{date}</h2>
                <div className="space-y-4">
                  {dateEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className={`bg-white rounded-xl shadow-md border transition-all duration-200 hover:shadow-lg ${
                        entry.type === 'schedule'
                          ? 'border-indigo-200 bg-gradient-to-r from-indigo-50/50 to-purple-50/50'
                          : 'border-green-200'
                      }`}
                    >
                      <div className="p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span
                                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                                  entry.type === 'schedule'
                                    ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                                    : 'bg-green-100 text-green-800 border border-green-300'
                                }`}
                              >
                                {entry.type === 'schedule' ? (
                                  <>
                                    <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    Schedule
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                    </svg>
                                    Automation
                                  </>
                                )}
                              </span>
                              <h3 className="text-xl font-bold text-slate-900">{entry.name}</h3>
                              {entry.deviceName && (
                                <span className="text-sm text-slate-600">({entry.deviceName})</span>
                              )}
                              <span className="text-sm text-slate-500">{formatTime(entry.timestamp)}</span>
                            </div>

                            {/* Action Details */}
                            <div className="mb-4">
                              {entry.type === 'schedule' ? (
                                <div className="space-y-2">
                                  <div className="text-sm text-slate-700">
                                    <span className="font-semibold">Zones:</span>{' '}
                                    {entry.actionDetails.zones?.map((zone, idx) => (
                                      <span key={zone.zoneId}>
                                        {zone.zoneName} ({formatDuration(zone.durationMinutes)})
                                        {idx < (entry.actionDetails.zones?.length || 0) - 1 ? ', ' : ''}
                                      </span>
                                    ))}
                                  </div>
                                  {entry.actionDetails.startTime && entry.actionDetails.finishTime && (
                                    <div className="text-sm text-slate-700">
                                      <span className="font-semibold">Duration:</span>{' '}
                                      {formatDuration(entry.actionDetails.totalDurationMinutes)} (
                                      {formatTime(entry.actionDetails.startTime)} - {formatTime(entry.actionDetails.finishTime)})
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-sm text-slate-700">
                                  {entry.action === 'set_rain_delay' && entry.actionDetails.hours && (
                                    <>
                                      <span className="font-semibold">Action:</span>
                                      {' Set rain delay for '}
                                      <span className="font-bold">{entry.actionDetails.hours} hours</span>
                                    </>
                                  )}
                                  {entry.action === 'run_zone' && entry.actionDetails.minutes && (
                                    <>
                                      <span className="font-semibold">Action:</span>
                                      {' Ran zone(s) for '}
                                      <span className="font-bold">{formatDuration(entry.actionDetails.minutes)}</span>
                                    </>
                                  )}
                                  {entry.action === 'automation_triggered' && (
                                    <>
                                      <span className="font-semibold">Action:</span>
                                      {' '}
                                      {entry.actionDetails.action || 'Triggered'}
                                    </>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Weather Stats */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-4">
                              {entry.temperature !== null && (
                                <div className="bg-slate-50 rounded-lg p-2 border border-slate-200">
                                  <div className="text-xs text-slate-600 uppercase tracking-wide">Temperature</div>
                                  <div className="text-sm font-bold text-slate-900">{entry.temperature.toFixed(1)}°F</div>
                                </div>
                              )}
                              {entry.humidity !== null && (
                                <div className="bg-slate-50 rounded-lg p-2 border border-slate-200">
                                  <div className="text-xs text-slate-600 uppercase tracking-wide">Humidity</div>
                                  <div className="text-sm font-bold text-slate-900">{entry.humidity.toFixed(1)}%</div>
                                </div>
                              )}
                              {entry.pressure !== null && (
                                <div className="bg-slate-50 rounded-lg p-2 border border-slate-200">
                                  <div className="text-xs text-slate-600 uppercase tracking-wide">Pressure</div>
                                  <div className="text-sm font-bold text-slate-900">{entry.pressure.toFixed(2)} inHg</div>
                                </div>
                              )}
                              {entry.rain24h !== null && (
                                <div className="bg-slate-50 rounded-lg p-2 border border-slate-200">
                                  <div className="text-xs text-slate-600 uppercase tracking-wide">Rain 24h</div>
                                  <div className="text-sm font-bold text-slate-900">{entry.rain24h.toFixed(2)}"</div>
                                </div>
                              )}
                              {entry.rain1h !== null && (
                                <div className="bg-slate-50 rounded-lg p-2 border border-slate-200">
                                  <div className="text-xs text-slate-600 uppercase tracking-wide">Rain 1h</div>
                                  <div className="text-sm font-bold text-slate-900">{entry.rain1h.toFixed(2)}"</div>
                                </div>
                              )}
                              {entry.soilMoisture !== null && (
                                <div className="bg-slate-50 rounded-lg p-2 border border-slate-200">
                                  <div className="text-xs text-slate-600 uppercase tracking-wide">Soil Moisture</div>
                                  <div className="text-sm font-bold text-slate-900">{entry.soilMoisture.toFixed(1)}%</div>
                                </div>
                              )}
                            </div>

                            {/* Completion Status */}
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                                  entry.completed
                                    ? 'bg-green-100 text-green-800 border border-green-200'
                                    : 'bg-red-100 text-red-800 border border-red-200'
                                }`}
                              >
                                {entry.completed ? (
                                  <>
                                    <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    Completed
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                    Failed
                                  </>
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
