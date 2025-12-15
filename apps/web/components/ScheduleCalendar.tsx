'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AutomationRule, Forecast16DayResponse, DailyForecast, RachioZone } from '../lib/api';
import { calculateScheduleOccurrences, groupOccurrencesByDate, ScheduleOccurrence } from '../lib/scheduleCalculator';
import { rachioApi } from '../lib/api';

interface ScheduleCalendarProps {
  automations: AutomationRule[];
  forecast: Forecast16DayResponse | null;
  onScheduleSkipped?: () => void;
}

interface ZoneDisplayData {
  zoneId: string;
  name: string;
  deviceName: string;
  imageUrl?: string | null;
  zoneNumber?: number | null;
  duration: number;
}

export function ScheduleCalendar({ automations, forecast, onScheduleSkipped }: ScheduleCalendarProps) {
  const [skippingScheduleId, setSkippingScheduleId] = useState<string | null>(null);
  const [scheduleZonesMap, setScheduleZonesMap] = useState<Map<string, ZoneDisplayData[]>>(new Map());
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

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

  // Fetch zone data with images for schedules
  useEffect(() => {
    const fetchZoneData = async () => {
      try {
        const devices = await rachioApi.getDevices();
        const zoneDeviceMap = new Map<string, string>(); // zoneId -> deviceName
        const zoneNameMap = new Map<string, string>(); // zoneId -> zoneName
        const zoneImageMap = new Map<string, string | null>(); // zoneId -> imageUrl
        const zoneNumberMap = new Map<string, number | null>(); // zoneId -> zoneNumber
        
        // Build zone maps
        for (const device of devices) {
          if (device.zones) {
            device.zones.forEach(zone => {
              zoneDeviceMap.set(zone.id, device.name);
              zoneNameMap.set(zone.id, zone.name);
              zoneImageMap.set(zone.id, zone.imageUrl || null);
              zoneNumberMap.set(zone.id, zone.zoneNumber || null);
            });
          }
        }
        
        // Map schedules to their zones
        const newScheduleZonesMap = new Map<string, ZoneDisplayData[]>();
        const rachioSchedules = automations.filter(r => r.source === 'rachio' && r.scheduleZones);
        
        for (const schedule of rachioSchedules) {
          if (schedule.scheduleZones && schedule.scheduleZones.length > 0) {
            const zoneData: ZoneDisplayData[] = schedule.scheduleZones.map(sz => ({
              zoneId: sz.zoneId,
              name: zoneNameMap.get(sz.zoneId) || `Zone ${sz.zoneId.substring(0, 8)}`,
              deviceName: zoneDeviceMap.get(sz.zoneId) || schedule.deviceName || 'Unknown Device',
              imageUrl: zoneImageMap.get(sz.zoneId) || null,
              zoneNumber: zoneNumberMap.get(sz.zoneId) || null,
              duration: Math.round(sz.duration / 60), // Convert seconds to minutes
            }));
            newScheduleZonesMap.set(schedule.id, zoneData);
          }
        }
        
        setScheduleZonesMap(newScheduleZonesMap);
      } catch (error) {
        console.error('Error fetching zone data for schedules:', error);
      }
    };
    
    fetchZoneData();
  }, [automations]);

  // Debug logging
  useEffect(() => {
    const rachioSchedules = automations.filter(r => r.source === 'rachio');
    console.log('ScheduleCalendar Debug:', {
      totalAutomations: automations.length,
      rachioSchedules: rachioSchedules.length,
      enabledRachioSchedules: rachioSchedules.filter(r => r.enabled).length,
      scheduleDetails: rachioSchedules.map(s => ({
        id: s.id,
        name: s.name,
        enabled: s.enabled,
        scheduleJobTypes: s.scheduleJobTypes,
        interval: s.interval,
        startDate: s.startDate,
        startDateFormatted: s.startDate ? new Date(s.startDate).toISOString() : null,
        endDate: s.endDate,
        repeat: s.repeat,
      })),
      totalOccurrences: occurrences.length,
      occurrencesByDateSize: occurrencesByDate.size,
      occurrencesByDate: Array.from(occurrencesByDate.entries()).map(([date, occs]) => ({
        date,
        schedules: occs.map(o => ({ id: o.scheduleId, name: o.scheduleName, isNext: o.isNextOccurrence })),
      })),
    });
  }, [automations, occurrences, occurrencesByDate]);

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

  // Convert mm to inches
  const mmToInches = (mm: number): number => {
    return mm / 25.4;
  };

  // Get weather icon based on precipitation data (same logic as Forecast7Day)
  const getWeatherIcon = (precipProb: number, precipSumMm: number): string => {
    // Heavy rain
    if (precipProb >= 50 || precipSumMm > 0.1) {
      return '🌧️';
    }
    // Rain/showers
    if (precipProb >= 30 || precipSumMm > 0.01) {
      return '🌦️';
    }
    // Cloudy with chance of rain
    if (precipProb >= 20) {
      return '⛅';
    }
    // Partly cloudy
    if (precipProb >= 10) {
      return '🌤️';
    }
    // Sunny
    return '☀️';
  };

  return (
    <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden flex flex-col h-full">
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-4 sm:px-6 py-4 border-b border-slate-200">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg sm:text-xl font-semibold text-white">Schedule Calendar</h2>
          <Link
            href="/automations"
            className="inline-flex items-center px-4 py-2.5 text-sm font-medium text-white bg-white/20 hover:bg-white/30 rounded-lg transition-all duration-200 min-h-[44px]"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Edit Automations
          </Link>
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
                      <div className="space-y-2">
                        {/* Weather Icon */}
                        <div className="flex items-center gap-3">
                          <div className="text-3xl">
                            {getWeatherIcon(dayForecast.precipProbMax, dayForecast.precipSumMm)}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-600 text-sm">Temperature:</span>
                              <span className="font-semibold text-slate-900 text-sm">
                                {formatTemperature(dayForecast.tempMinC)} - {formatTemperature(dayForecast.tempMaxC)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-slate-600 text-sm">Precipitation:</span>
                              <span className="font-semibold text-slate-900 text-sm">
                                {dayForecast.precipProbMax > 0 ? (
                                  <>
                                    {dayForecast.precipProbMax}% chance
                                    {dayForecast.precipSumMm > 0.01 && (
                                      <>, {mmToInches(dayForecast.precipSumMm).toFixed(2)}"
                                      </>
                                    )}
                                  </>
                                ) : (
                                  'None expected'
                                )}
                              </span>
                            </div>
                          </div>
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
                      <div className="space-y-3">
                        {dayOccurrences.map((occurrence) => {
                          const zones = scheduleZonesMap.get(occurrence.scheduleId) || [];
                          return (
                            <div
                              key={`${occurrence.date}-${occurrence.scheduleId}`}
                              className="p-2 bg-indigo-50 rounded border border-indigo-100"
                            >
                              <div className="flex items-start justify-between mb-2">
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
                                    className="ml-2 inline-flex items-center px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[32px] flex-shrink-0"
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
                              {zones.length > 0 && (
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5 mt-2">
                                  {zones.map((zone) => (
                                    <div
                                      key={zone.zoneId}
                                      className="flex flex-col items-center bg-white rounded border border-indigo-200 overflow-hidden"
                                    >
                                      {/* Zone Image */}
                                      <div className="w-full aspect-square bg-slate-100 overflow-hidden relative">
                                        {zone.imageUrl && !failedImages.has(zone.zoneId) ? (
                                          <img
                                            src={zone.imageUrl}
                                            alt={zone.name}
                                            className="w-full h-full object-cover"
                                            onError={() => {
                                              setFailedImages(prev => new Set(prev).add(zone.zoneId));
                                            }}
                                          />
                                        ) : (
                                          <div className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                                            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                            </svg>
                                          </div>
                                        )}
                                        {/* Duration Badge Overlay */}
                                        <div className="absolute top-0.5 right-0.5 bg-blue-600 text-white text-[9px] font-semibold px-1 py-0.5 rounded shadow">
                                          {zone.duration}m
                                        </div>
                                      </div>
                                      {/* Zone Label */}
                                      <div className="w-full p-1 text-center">
                                        <div className="text-[9px] font-semibold text-slate-900 leading-tight truncate">
                                          {zone.deviceName} - {zone.name}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
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

