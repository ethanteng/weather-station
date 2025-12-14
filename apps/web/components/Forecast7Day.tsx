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
        <div className="bg-slate-800 px-4 sm:px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg sm:text-xl font-semibold text-white">7-Day Forecast</h2>
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
        <div className="bg-slate-800 px-4 sm:px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg sm:text-xl font-semibold text-white">7-Day Forecast</h2>
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
      <div className="bg-slate-800 px-6 py-4 border-b border-slate-200">
        <h2 className="text-xl font-semibold text-white">7-Day Forecast</h2>
      </div>
      <div className="px-4 py-3">
        {/* Responsive 7-Day Forecast */}
        <div className="overflow-x-auto -mx-4 px-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 min-w-max lg:min-w-0">
          {forecast.days.map((day, index) => {
            const { dayName, date } = formatDate(day.date);
            const tempMaxF = celsiusToFahrenheit(day.tempMaxC);
            const tempMinF = celsiusToFahrenheit(day.tempMinC);
            const precipInches = mmToInches(day.precipSumMm);
            const precipProb = day.precipProbMax;
            const hasSignificantRain = precipProb >= 30 || precipInches > 0.01;
            const hasHeavyRain = precipProb >= 50 || precipInches > 0.1;

            return (
              <div
                key={index}
                className={`rounded-lg border-2 p-2 transition-all ${
                  hasHeavyRain
                    ? 'bg-gradient-to-br from-blue-200 to-blue-300 border-blue-500 shadow-md'
                    : hasSignificantRain
                    ? 'bg-blue-100 border-blue-400'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="text-center space-y-1">
                  {/* Day and Date - Compact */}
                  <div>
                    <div className={`text-xs sm:text-sm font-semibold ${
                      hasSignificantRain ? 'text-blue-900' : 'text-slate-700'
                    }`}>
                      {dayName}
                    </div>
                    <div className="text-[10px] sm:text-xs text-slate-600">{date}</div>
                  </div>

                  {/* Temperature - Inline, Smaller */}
                  <div className="text-xs sm:text-sm text-slate-600">
                    <span className="font-medium">{tempMaxF.toFixed(0)}°</span>
                    <span className="text-slate-500">/{tempMinF.toFixed(0)}°</span>
                  </div>

                  {/* Rain Info - Highlighted */}
                  {hasSignificantRain ? (
                    <div className={`pt-1 border-t ${
                      hasHeavyRain ? 'border-blue-600' : 'border-blue-400'
                    }`}>
                      <div className={`text-xs sm:text-sm font-bold ${
                        hasHeavyRain ? 'text-blue-900' : 'text-blue-800'
                      }`}>
                        {precipProb}%
                      </div>
                      {precipInches > 0.01 && (
                        <div className={`text-[10px] sm:text-xs ${
                          hasHeavyRain ? 'text-blue-900 font-bold' : 'text-blue-700'
                        }`}>
                          {precipInches.toFixed(2)}"
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-[10px] sm:text-xs text-slate-400 pt-1">
                      {precipProb}%
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </div>
    </div>
  );
}
