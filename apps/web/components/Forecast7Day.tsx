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
            const precipProb = day.precipProbMax;
            const hasSignificantRain = precipProb >= 30 || precipInches > 0.01;
            const hasHeavyRain = precipProb >= 50 || precipInches > 0.1;

            // Determine background color based on precipitation
            const getBackgroundColor = () => {
              if (hasHeavyRain) {
                return 'bg-gradient-to-br from-blue-100 to-blue-200 border-blue-400';
              } else if (hasSignificantRain) {
                return 'bg-blue-50 border-blue-300';
              }
              return 'bg-slate-50 border-slate-200';
            };

            // Determine precipitation text color
            const getPrecipColor = () => {
              if (hasHeavyRain) {
                return 'text-blue-900 font-bold';
              } else if (hasSignificantRain) {
                return 'text-blue-800 font-semibold';
              }
              return 'text-blue-600';
            };

            return (
              <div
                key={index}
                className={`${getBackgroundColor()} rounded-lg border-2 p-4 hover:shadow-md transition-all ${
                  hasHeavyRain ? 'shadow-sm' : ''
                }`}
              >
                <div className="text-center">
                  {/* Day and Date */}
                  <div className="mb-3">
                    <div className="font-semibold text-slate-900 text-sm flex items-center justify-center gap-1">
                      {hasSignificantRain && (
                        <svg
                          className="w-4 h-4 text-blue-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                          />
                        </svg>
                      )}
                      {dayName}
                    </div>
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
                    <div className="text-xs text-slate-600 mb-1 flex items-center justify-center gap-1">
                      {hasSignificantRain && (
                        <svg
                          className={`w-4 h-4 ${hasHeavyRain ? 'text-blue-800' : 'text-blue-600'}`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M5.5 16a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 16h-8z" />
                        </svg>
                      )}
                      Precip
                    </div>
                    <div className={`text-base ${getPrecipColor()} flex items-center justify-center gap-1`}>
                      {hasSignificantRain && (
                        <svg
                          className="w-4 h-4"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M5.5 16a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 16h-8z" />
                        </svg>
                      )}
                      {precipProb}%
                      {hasHeavyRain && (
                        <span className="ml-1 text-xs" title="Heavy rain expected">🌧️</span>
                      )}
                    </div>
                  </div>

                  {/* Precipitation Amount */}
                  <div>
                    <div className="text-xs text-slate-600 mb-1 flex items-center justify-center gap-1">
                      {precipInches > 0.01 && (
                        <svg
                          className="w-3 h-3 text-blue-600"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                      Amount
                    </div>
                    <div className={`text-sm ${getPrecipColor()} flex items-center justify-center gap-1`}>
                      {precipInches > 0.01 && (
                        <svg
                          className="w-4 h-4"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                      <span className={precipInches > 0.1 ? 'font-bold' : ''}>
                        {precipInches.toFixed(2)} in
                      </span>
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
