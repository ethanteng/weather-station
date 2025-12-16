'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface RainfallDataPoint {
  timestamp: string;
  rain24h: number | null;
}

interface RainfallChartProps {
  data: RainfallDataPoint[];
}

export function RainfallChart({ data }: RainfallChartProps) {
  const chartData = data.map((point) => ({
    time: new Date(point.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    rainfall: point.rain24h || 0,
  }));

  return (
    <div className="h-64 mt-4">
      <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">24 Hour Trend</div>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="time"
            stroke="#64748b"
            fontSize={12}
            tickLine={false}
          />
          <YAxis
            stroke="#64748b"
            fontSize={12}
            tickLine={false}
            domain={[0, 1]}
            label={{ value: 'Inches', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#64748b', fontSize: '12px' } }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            }}
            labelStyle={{ color: '#1e293b', fontWeight: 600 }}
          />
          <Line
            type="monotone"
            dataKey="rainfall"
            stroke="#3b82f6"
            strokeWidth={3}
            dot={{ fill: '#3b82f6', r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
