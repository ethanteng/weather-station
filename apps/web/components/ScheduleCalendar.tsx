'use client';

import { useState } from 'react';
import { AutomationRule, Forecast16DayResponse, DailyForecast } from '../lib/api';
import { calculateScheduleOccurrences, groupOccurrencesByDate, ScheduleOccurrence } from '../lib/scheduleCalculator';
import { rachioApi } from '../lib/api';

interface ScheduleCalendarProps {
  automations: AutomationRule[];
  forecast: Forecast16DayResponse | null;
  onScheduleSkipped?: () => void;
}

export function ScheduleCalendar({ automations, forecast, onScheduleSkipped }: ScheduleCalendarProps) {
  const [skippingScheduleId, setSkippingScheduleId] = useState<string | null>(null);

  // Generate array of 30 days starting from today
  const today = new Date();
  const days: Date[] = [];
  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    days.push(date);
  }

  // Calculate schedule occurrences
  const occurrences = calculateScheduleOccurrences(automations, today);
  const occurrencesByDate = groupOccurrencesByDate(occurrences);

  // Create a map of forecast data by date
  const forecastByDate = new Map<string, DailyForecast>();
  if (forecast) {
    for (const day of forecast.days) {
      forecastByDate.set(day.date, day);
    }
  }

  const handleSkipSchedule = async (scheduleId: string) => {
    if (skippingScheduleId) return; // Already processing
    
    setSkippingScheduleId(scheduleId);
    try {
      await rachioApi.skipSchedule(scheduleId);
      if (onScheduleSkipped) {
        onScheduleSkipped();
      }
    } catch (error) {
      console.error('Error skipping schedule:', error);
      alert(`Failed to skip schedule: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSkippingScheduleId(null);
    }
  };

  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getDayName = (date: Date): string => {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  };

  const getShortDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTemperature = (tempC: number): string => {
    const tempF = (tempC * 9) / 5 + 32;
    return `${Math.round(tempF)}°F`;
  };

  return (
    <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden flex flex-col h-full">
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-4 sm:px-6 py-4 border-b border-slate-200">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg sm:text-xl font-semibold text-white">Schedule Calendar</h2>
          <div className="text-sm text-white/80">
            Next 30 Days
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto max-h-[600px]">
        <div className="p-4 sm:p-6 space-y-4">
          {days.map((day) => {
            const dateStr = formatDate(day);
            const dayOccurrences = occurrencesByDate.get(dateStr) || [];
            const dayForecast = forecastByDate.get(dateStr);
            const isToday = dateStr === formatDate(today);

            return (
              <div
                key={dateStr}
                className={`bg-slate-50 rounded-lg border ${
                  isToday ? 'border-blue-400 border-2 shadow-md' : 'border-slate-200'
                } p-4 hover:bg-slate-100 transition-colors`}
              >
                {/* Date Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`text-sm font-semibold ${
                      isToday ? 'text-blue-700' : 'text-slate-700'
                    }`}>
                      {getDayName(day)}
                    </div>
                    <div className={`text-lg font-bold ${
                      isToday ? 'text-blue-900' : 'text-slate-900'
                    }`}>
                      {getShortDate(day)}
                    </div>
                    {isToday && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 border border-blue-300">
                        Today
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Forecast Section */}
                  <div className="bg-white rounded-lg border border-slate-200 p-3">
                    <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                      Forecast
                    </div>
                    {dayForecast ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-600">Temperature:</span>
                          <span className="font-semibold text-slate-900">
                            {formatTemperature(dayForecast.tempMinC)} - {formatTemperature(dayForecast.tempMaxC)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-600">Precipitation:</span>
                          <span className="font-semibold text-slate-900">
                            {dayForecast.precipProbMax > 0 ? (
                              <>
                                {dayForecast.precipProbMax}% chance, {dayForecast.precipSumMm.toFixed(1)}mm
                              </>
                            ) : (
                              'None expected'
                            )}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-slate-500 italic text-sm">
                        Forecast not available
                      </div>
                    )}
                  </div>

                  {/* Schedules Section */}
                  <div className="bg-white rounded-lg border border-slate-200 p-3">
                    <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                      Scheduled Runs
                    </div>
                    {dayOccurrences.length > 0 ? (
                      <div className="space-y-2">
                        {dayOccurrences.map((occurrence) => (
                          <div
                            key={`${occurrence.date}-${occurrence.scheduleId}`}
                            className="flex items-center justify-between p-2 bg-indigo-50 rounded border border-indigo-100"
                          >
                            <div className="flex-1">
                              <div className="font-medium text-slate-900 text-sm">
                                {occurrence.scheduleName}
                              </div>
                              {occurrence.deviceName && (
                                <div className="text-xs text-slate-600">
                                  {occurrence.deviceName}
                                </div>
                              )}
                            </div>
                            {occurrence.isNextOccurrence && (
                              <button
                                onClick={() => handleSkipSchedule(occurrence.scheduleId)}
                                disabled={skippingScheduleId === occurrence.scheduleId}
                                className="ml-2 inline-flex items-center px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[32px]"
                                title="Skip this scheduled run"
                              >
                                {skippingScheduleId === occurrence.scheduleId ? (
                                  <>
                                    <svg className="animate-spin w-3 h-3 mr-1.5" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Skipping...
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                    Skip
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-slate-500 italic text-sm">
                        No schedules
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
