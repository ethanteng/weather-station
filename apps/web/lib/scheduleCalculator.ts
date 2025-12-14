import { AutomationRule } from './api';

export interface ScheduleOccurrence {
  date: string; // YYYY-MM-DD
  scheduleId: string;
  scheduleName: string;
  deviceName?: string;
  isNextOccurrence: boolean; // True if this is the schedule's next occurrence
}

/**
 * Calculate which days a schedule will run over the next 30 days
 */
export function calculateScheduleOccurrences(
  automations: AutomationRule[],
  startDate: Date = new Date()
): ScheduleOccurrence[] {
  const occurrences: ScheduleOccurrence[] = [];
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 30);

  // Filter to only enabled Rachio schedules
  const rachioSchedules = automations.filter(
    (rule) => rule.source === 'rachio' && rule.enabled
  );

  for (const schedule of rachioSchedules) {
    const scheduleDates = calculateScheduleDates(schedule, startDate, endDate);
    
    // Find the first occurrence (next occurrence)
    const firstOccurrence = scheduleDates.length > 0 ? scheduleDates[0] : null;

    for (const date of scheduleDates) {
      occurrences.push({
        date,
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        deviceName: schedule.deviceName,
        isNextOccurrence: date === firstOccurrence,
      });
    }
  }

  return occurrences;
}

/**
 * Calculate dates when a schedule will run within a date range
 */
function calculateScheduleDates(
  schedule: AutomationRule,
  startDate: Date,
  endDate: Date
): string[] {
  const dates: string[] = [];
  
  // Check if schedule has an endDate that's already passed
  if (schedule.endDate) {
    const scheduleEndDate = new Date(schedule.endDate * 1000);
    if (scheduleEndDate < startDate) {
      return dates; // Schedule has ended
    }
  }

  // Determine the effective start date
  let effectiveStartDate = startDate;
  if (schedule.startDate) {
    const scheduleStartDate = new Date(schedule.startDate * 1000);
    if (scheduleStartDate > startDate) {
      effectiveStartDate = scheduleStartDate;
    }
  }

  // Handle different schedule types
  if (schedule.scheduleJobTypes && schedule.scheduleJobTypes.length > 0) {
    const jobType = schedule.scheduleJobTypes[0];
    
    if (jobType.startsWith('INTERVAL_')) {
      // Interval-based schedule (e.g., every 14 days)
      const interval = parseInt(jobType.replace('INTERVAL_', ''), 10);
      if (!isNaN(interval) && interval > 0) {
        dates.push(...calculateIntervalDates(effectiveStartDate, endDate, interval, schedule.endDate));
      }
    } else if (jobType.startsWith('DAY_OF_WEEK_')) {
      // Day of week schedule (e.g., every Wednesday)
      const dayOfWeek = parseInt(jobType.replace('DAY_OF_WEEK_', ''), 10);
      if (!isNaN(dayOfWeek) && dayOfWeek >= 0 && dayOfWeek <= 6) {
        dates.push(...calculateDayOfWeekDates(effectiveStartDate, endDate, dayOfWeek, schedule.endDate));
      }
    }
  } else if (schedule.interval && schedule.interval > 0) {
    // Fallback to interval if scheduleJobTypes not available
    dates.push(...calculateIntervalDates(effectiveStartDate, endDate, schedule.interval, schedule.endDate));
  }

  return dates;
}

/**
 * Calculate dates for interval-based schedules
 */
function calculateIntervalDates(
  startDate: Date,
  endDate: Date,
  intervalDays: number,
  scheduleEndDate?: number | null
): string[] {
  const dates: string[] = [];
  let currentDate = new Date(startDate);
  
  const effectiveEndDate = scheduleEndDate
    ? new Date(Math.min(endDate.getTime(), scheduleEndDate * 1000))
    : endDate;

  while (currentDate <= effectiveEndDate) {
    dates.push(formatDate(currentDate));
    currentDate = new Date(currentDate);
    currentDate.setDate(currentDate.getDate() + intervalDays);
  }

  return dates;
}

/**
 * Calculate dates for day-of-week schedules
 */
function calculateDayOfWeekDates(
  startDate: Date,
  endDate: Date,
  targetDayOfWeek: number, // 0 = Sunday, 6 = Saturday
  scheduleEndDate?: number | null
): string[] {
  const dates: string[] = [];
  const currentDate = new Date(startDate);
  
  const effectiveEndDate = scheduleEndDate
    ? new Date(Math.min(endDate.getTime(), scheduleEndDate * 1000))
    : endDate;

  // Find the first occurrence of the target day of week
  const currentDayOfWeek = currentDate.getDay();
  let daysUntilTarget = (targetDayOfWeek - currentDayOfWeek + 7) % 7;
  
  // If today is the target day, include it
  if (daysUntilTarget === 0) {
    if (currentDate <= effectiveEndDate) {
      dates.push(formatDate(currentDate));
    }
    daysUntilTarget = 7; // Move to next week
  }

  // Move to the next occurrence
  const nextDate = new Date(currentDate);
  nextDate.setDate(nextDate.getDate() + daysUntilTarget);

  // Add all subsequent occurrences
  while (nextDate <= effectiveEndDate) {
    dates.push(formatDate(nextDate));
    nextDate.setDate(nextDate.getDate() + 7); // Next week
  }

  return dates;
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Group schedule occurrences by date
 */
export function groupOccurrencesByDate(
  occurrences: ScheduleOccurrence[]
): Map<string, ScheduleOccurrence[]> {
  const grouped = new Map<string, ScheduleOccurrence[]>();
  
  for (const occurrence of occurrences) {
    if (!grouped.has(occurrence.date)) {
      grouped.set(occurrence.date, []);
    }
    grouped.get(occurrence.date)!.push(occurrence);
  }
  
  return grouped;
}
