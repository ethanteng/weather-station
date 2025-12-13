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
      <div className="card">
        <h2>Recent Watering Events</h2>
        <p>No watering events found.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Recent Watering Events</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Zone</th>
            <th>Duration</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td>{new Date(event.timestamp).toLocaleString()}</td>
              <td>{zones[event.zoneId] || event.zoneId}</td>
              <td>{Math.round(event.durationSec / 60)} min</td>
              <td>{event.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

