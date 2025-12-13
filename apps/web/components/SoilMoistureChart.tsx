'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface SoilMoistureDataPoint {
  timestamp: string;
  soilMoisture: number | null;
}

interface SoilMoistureChartProps {
  data: SoilMoistureDataPoint[];
}

export function SoilMoistureChart({ data }: SoilMoistureChartProps) {
  const chartData = data.map((point) => ({
    time: new Date(point.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    moisture: point.soilMoisture || 0,
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
            domain={[0, 100]}
            stroke="#64748b"
            fontSize={12}
            tickLine={false}
            label={{ value: 'Percentage', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#64748b', fontSize: '12px' } }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            }}
            labelStyle={{ color: '#1e293b', fontWeight: 600 }}
            formatter={(value: number) => [`${value.toFixed(1)}%`, 'Moisture']}
          />
          <Line
            type="monotone"
            dataKey="moisture"
            stroke="#10b981"
            strokeWidth={3}
            dot={{ fill: '#10b981', r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
