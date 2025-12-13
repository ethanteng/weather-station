'use client';

interface WeatherCardProps {
  label: string;
  value: number | null;
  unit: string;
  icon?: string;
}

export function WeatherCard({ label, value, unit, icon }: WeatherCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden hover:shadow-lg transition-shadow">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold text-slate-600 uppercase tracking-wide">{label}</div>
          {icon && <span className="text-2xl">{icon}</span>}
        </div>
        <div className="text-4xl font-bold text-slate-900">
          {value !== null ? (
            <>
              {value.toFixed(1)}
              <span className="text-2xl text-slate-600 ml-1">{unit}</span>
            </>
          ) : (
            <span className="text-slate-400 text-2xl">N/A</span>
          )}
        </div>
      </div>
    </div>
  );
}
