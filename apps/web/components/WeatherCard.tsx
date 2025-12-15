'use client';

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

export function WeatherCard({ label, value, unit, icon, trendData }: WeatherCardProps) {
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

  return (
    <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden hover:shadow-lg transition-shadow">
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs sm:text-sm font-semibold text-slate-600 uppercase tracking-wide">{label}</div>
          {icon && <span className="text-xl sm:text-2xl">{icon}</span>}
        </div>
        <div className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
          {value !== null ? (
            <>
              {value.toFixed(1)}
              <span className="text-xl sm:text-2xl text-slate-600 ml-1">{unit}</span>
            </>
          ) : (
            <span className="text-slate-400 text-xl sm:text-2xl">N/A</span>
          )}
        </div>
        {hasTrendData && (
          <div className="h-32 mt-4">
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
                  width={35}
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
                  formatter={(value: number) => [`${value.toFixed(1)}${unit}`, '']}
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
    </div>
  );
}
