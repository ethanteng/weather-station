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
        <div className="bg-slate-800 px-4 sm:px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg sm:text-xl font-semibold text-white">Recent Watering Events</h2>
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


  const getSourceLabel = (source: string) => {
    const labels = {
      manual: 'Manual',
      schedule: 'Schedule',
      automation: 'Automation',
    };
    return labels[source as keyof typeof labels] || 'Manual';
  };

  return (
    <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
      <div className="bg-slate-800 px-6 py-4 border-b border-slate-200">
        <h2 className="text-xl font-semibold text-white">Recent Watering Events</h2>
      </div>
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
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
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                  {zones[event.zoneId] || event.zoneId}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900">
                  {Math.round(event.durationSec / 60)} min
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                  {getSourceLabel(event.source)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile Card View */}
      <div className="md:hidden divide-y divide-slate-200">
        {events.map((event) => (
          <div key={event.id} className="p-4">
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-900 mb-1">
                  {zones[event.zoneId] || event.zoneId}
                </div>
                <div className="text-xs text-slate-600">
                  {new Date(event.timestamp).toLocaleString()}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-slate-900">
                  {Math.round(event.durationSec / 60)} min
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  {getSourceLabel(event.source)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
