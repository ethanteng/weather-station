'use client';

interface WateringEvent {
  id: string;
  timestamp: string;
  zoneId: string;
  durationSec: number;
  source: 'manual' | 'schedule' | 'automation';
}

interface WateringEventsTableProps {
  events: WateringEvent[];
  zones: Record<string, string>; // zoneId -> zoneName mapping
}

export function WateringEventsTable({ events, zones }: WateringEventsTableProps) {
  if (events.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-cyan-600 to-cyan-700 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💧</span>
            <h2 className="text-xl font-semibold text-white">Recent Watering Events</h2>
          </div>
        </div>
        <div className="p-6 text-center">
          <svg className="w-12 h-12 mx-auto text-slate-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-slate-600">No watering events found.</p>
        </div>
      </div>
    );
  }

  const getSourceBadge = (source: string) => {
    const badges = {
      manual: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200', label: 'Manual' },
      schedule: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-200', label: 'Schedule' },
      automation: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200', label: 'Automation' },
    };
    const badge = badges[source as keyof typeof badges] || badges.manual;
    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${badge.bg} ${badge.text} ${badge.border} border`}>
        {badge.label}
      </span>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
      <div className="bg-gradient-to-r from-cyan-600 to-cyan-700 px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">💧</span>
          <h2 className="text-xl font-semibold text-white">Recent Watering Events</h2>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Time</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Zone</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Duration</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Source</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {events.map((event) => (
              <tr key={event.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                  {new Date(event.timestamp).toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium bg-indigo-100 text-indigo-800 border border-indigo-200">
                    {zones[event.zoneId] || event.zoneId}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900">
                  {Math.round(event.durationSec / 60)} min
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getSourceBadge(event.source)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
