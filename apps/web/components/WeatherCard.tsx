'use client';

import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface TrendDataPoint {
  timestamp: string;
  value: number | null;
}

interface WeatherCardProps {
  label: string;
  value: number | null;
  unit: string;
  icon?: string;
  trendData?: TrendDataPoint[];
}

// Pressure level categories
const PRESSURE_LEVELS = [
  { label: 'Very High', min: 30.7, max: 32, color: 'red' },
  { label: 'High', min: 30.2, max: 30.69, color: 'orange' },
  { label: 'Normal', min: 29.8, max: 30.19, color: 'green' },
  { label: 'Low', min: 29, max: 29.79, color: 'blue' },
  { label: 'Very Low', min: 28, max: 28.99, color: 'purple' },
];

function getPressureLevel(pressure: number | null): typeof PRESSURE_LEVELS[0] | null {
  if (pressure === null) return null;
  return PRESSURE_LEVELS.find(level => pressure >= level.min && pressure <= level.max) || null;
}

function calculatePressureYAxisDomain(data: number[]): [number, number] {
  if (data.length === 0) return [30.0, 30.5];
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min;
  
  // Add padding (20% of range, minimum 0.1 inHg)
  const padding = Math.max(range * 0.2, 0.1);
  
  // Round down min and round up max to nearest 0.02
  const roundedMin = Math.floor((min - padding) * 50) / 50;
  const roundedMax = Math.ceil((max + padding) * 50) / 50;
  
  return [roundedMin, roundedMax];
}

export function WeatherCard({ label, value, unit, icon, trendData }: WeatherCardProps) {
  const isPressure = label === 'Pressure';
  const [showPressureModal, setShowPressureModal] = useState(false);
  
  // Close modal on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showPressureModal) {
        setShowPressureModal(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showPressureModal]);
  
  // Prepare chart data from trend data
  const chartData = trendData && trendData.length > 0
    ? trendData
        .filter(point => point.value !== null && point.value !== undefined)
        .map((point) => ({
          date: new Date(point.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          value: point.value,
          fullDate: new Date(point.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        }))
    : [];

  const hasTrendData = chartData.length > 0;
  
  // Calculate y-axis domain for pressure
  const pressureYAxisDomain = isPressure && chartData.length > 0
    ? calculatePressureYAxisDomain(chartData.map(d => d.value as number))
    : undefined;
  
  // Get pressure level for current reading
  const pressureLevel = isPressure ? getPressureLevel(value) : null;

  return (
    <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden hover:shadow-lg transition-shadow flex flex-col h-full">
      <div className="p-4 sm:p-6 flex flex-col flex-grow">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs sm:text-sm font-semibold text-slate-600 uppercase tracking-wide">{label}</div>
          {icon && <span className="text-xl sm:text-2xl">{icon}</span>}
        </div>
        <div className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">
          {value !== null ? (
            <>
              {isPressure ? value.toFixed(2) : value.toFixed(1)}
              <span className="text-xl sm:text-2xl text-slate-600 ml-1">{unit}</span>
            </>
          ) : (
            <span className="text-slate-400 text-xl sm:text-2xl">N/A</span>
          )}
        </div>
        {isPressure && pressureLevel && (
          <div className="mb-4">
            <button
              onClick={() => setShowPressureModal(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 bg-white hover:bg-slate-50 transition-colors cursor-pointer"
              style={{
                borderColor: pressureLevel.color === 'red' ? '#ef4444' :
                            pressureLevel.color === 'orange' ? '#f97316' :
                            pressureLevel.color === 'green' ? '#10b981' :
                            pressureLevel.color === 'blue' ? '#3b82f6' :
                            '#a855f7',
              }}
            >
              <div 
                className="w-3 h-3 rounded-full"
                style={{
                  backgroundColor: pressureLevel.color === 'red' ? '#ef4444' :
                                  pressureLevel.color === 'orange' ? '#f97316' :
                                  pressureLevel.color === 'green' ? '#10b981' :
                                  pressureLevel.color === 'blue' ? '#3b82f6' :
                                  '#a855f7',
                }}
              />
              <span className="text-sm font-semibold text-slate-900">{pressureLevel.label} Pressure</span>
            </button>
          </div>
        )}
        {hasTrendData && (
          <div className="h-32 mt-auto">
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">7-Day Trend</div>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  stroke="#64748b"
                  fontSize={10}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={10}
                  tickLine={false}
                  width={isPressure ? 45 : 35}
                  domain={pressureYAxisDomain}
                  tickFormatter={(val: number) => isPressure ? val.toFixed(2) : val.toFixed(1)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: '#1e293b', fontWeight: 600 }}
                  formatter={(value: number) => [`${isPressure ? value.toFixed(2) : value.toFixed(1)}${unit}`, '']}
                  labelFormatter={(label) => `Date: ${label}`}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6', r: 2 }}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      
      {/* Pressure Levels Modal */}
      {isPressure && showPressureModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={() => setShowPressureModal(false)}
          />
          
          {/* Modal */}
          <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full transform transition-all">
            <div className="p-6 border-t-4 rounded-t-xl bg-blue-50 border-blue-200">
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">
                    Understanding Barometric Pressure Levels
                  </h3>
                  <div className="space-y-2 mt-4">
                    {PRESSURE_LEVELS.map((level) => (
                      <div key={level.label} className="flex items-center gap-3 text-sm">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: level.color === 'red' ? '#ef4444' :
                                            level.color === 'orange' ? '#f97316' :
                                            level.color === 'green' ? '#10b981' :
                                            level.color === 'blue' ? '#3b82f6' :
                                            '#a855f7',
                          }}
                        />
                        <span className="text-slate-700 font-medium min-w-[100px]">{level.label}:</span>
                        <span className="text-slate-600">{level.min} - {level.max} inHg</span>
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => setShowPressureModal(false)}
                  className="flex-shrink-0 text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 rounded-b-xl flex justify-end gap-3">
              <button
                onClick={() => setShowPressureModal(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-blue-600 text-white hover:bg-blue-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
