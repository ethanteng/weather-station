'use client';

import { useEffect, useState } from 'react';
import { forecastApi, Forecast7DayResponse } from '../lib/api';

export function Forecast7Day() {
  const [forecast, setForecast] = useState<Forecast7DayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchForecast = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await forecastApi.get7Day();
        setForecast(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch forecast');
      } finally {
        setLoading(false);
      }
    };

    fetchForecast();
  }, []);

  // Convert Celsius to Fahrenheit
  const celsiusToFahrenheit = (c: number): number => {
    return (c * 9) / 5 + 32;
  };

  // Convert mm to inches
  const mmToInches = (mm: number): number => {
    return mm / 25.4;
  };

  // Format date to day name + MM/DD
  const formatDate = (dateStr: string): { dayName: string; date: string } => {
    const date = new Date(dateStr + 'T12:00:00'); // Use noon to avoid timezone issues
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const dateFormatted = date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
    return { dayName, date: dateFormatted };
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden mb-6">
        <div className="bg-gradient-to-r from-cyan-600 to-cyan-700 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📅</span>
            <h2 className="text-xl font-semibold text-white">7-Day Forecast</h2>
          </div>
        </div>
        <div className="p-6">
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600 mb-2"></div>
            <p className="text-slate-600 text-sm">Loading forecast...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden mb-6">
        <div className="bg-gradient-to-r from-cyan-600 to-cyan-700 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📅</span>
            <h2 className="text-xl font-semibold text-white">7-Day Forecast</h2>
          </div>
        </div>
        <div className="p-6">
          <div className="text-center py-4">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!forecast || forecast.days.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden mb-6">
      <div className="bg-gradient-to-r from-cyan-600 to-cyan-700 px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📅</span>
          <h2 className="text-xl font-semibold text-white">7-Day Forecast</h2>
        </div>
      </div>
      <div className="p-6">
        {/* 7-Day Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {forecast.days.map((day, index) => {
            const { dayName, date } = formatDate(day.date);
            const tempMaxF = celsiusToFahrenheit(day.tempMaxC);
            const tempMinF = celsiusToFahrenheit(day.tempMinC);
            const precipInches = mmToInches(day.precipSumMm);

            return (
              <div
                key={index}
                className="bg-slate-50 rounded-lg border border-slate-200 p-4 hover:shadow-md transition-shadow"
              >
                <div className="text-center">
                  {/* Day and Date */}
                  <div className="mb-3">
                    <div className="font-semibold text-slate-900 text-sm">{dayName}</div>
                    <div className="text-xs text-slate-600">{date}</div>
                  </div>

                  {/* Temperature */}
                  <div className="mb-3">
                    <div className="text-lg font-bold text-slate-900">
                      {tempMaxF.toFixed(0)}°F
                    </div>
                    <div className="text-sm text-slate-600">
                      {tempMinF.toFixed(0)}°F
                    </div>
                  </div>

                  {/* Precipitation Probability */}
                  <div className="mb-2">
                    <div className="text-xs text-slate-600 mb-1">Precip</div>
                    <div className="text-sm font-semibold text-blue-700">
                      {day.precipProbMax}%
                    </div>
                  </div>

                  {/* Precipitation Amount */}
                  <div>
                    <div className="text-xs text-slate-600 mb-1">Amount</div>
                    <div className="text-sm font-semibold text-blue-700">
                      {precipInches.toFixed(2)} in
                    </div>
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
