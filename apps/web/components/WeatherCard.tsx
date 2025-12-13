'use client';

interface WeatherCardProps {
  label: string;
  value: number | null;
  unit: string;
  icon?: string;
}

export function WeatherCard({ label, value, unit, icon }: WeatherCardProps) {
  return (
    <div className="card">
      <div className="stat">
        <div className="stat-label">{label}</div>
        <div className="stat-value">
          {value !== null ? `${value.toFixed(1)}${unit}` : 'N/A'}
        </div>
      </div>
    </div>
  );
}

