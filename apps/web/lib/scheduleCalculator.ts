import { AutomationRule } from './api';

export interface ScheduleOccurrence {
  date: string; // YYYY-MM-DD
  scheduleId: string;
  scheduleName: string;
  deviceName?: string;
  isNextOccurrence: boolean; // True if this is the schedule's next occurrence
}

/**
 * Calculate which days a schedule will run over the next 90 days
 */
export function calculateScheduleOccurrences(
  automations: AutomationRule[],
  startDate: Date = new Date()
): ScheduleOccurrence[] {
  const occurrences: ScheduleOccurrence[] = [];
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 90);

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
  let dates: string[] = [];
  
  // Check if schedule has an endDate that's already passed
  // Rachio API returns timestamps in milliseconds (e.g., 1437677593983)
  if (schedule.endDate) {
    const scheduleEndDate = new Date(schedule.endDate);
    if (scheduleEndDate < startDate) {
      return dates; // Schedule has ended
    }
  }

  // Determine the effective start date
  // For interval-based schedules, use the schedule's startDate if it exists
  // For day-of-week schedules, use today or the schedule's startDate, whichever is later
  let effectiveStartDate = new Date(startDate);
  effectiveStartDate.setHours(0, 0, 0, 0); // Normalize to start of day
  
  if (schedule.startDate) {
    // Rachio API returns timestamps in milliseconds (e.g., 1437677593983)
    const scheduleStartDate = new Date(schedule.startDate);
    scheduleStartDate.setHours(0, 0, 0, 0); // Normalize to start of day
    
    // For interval schedules, always use the schedule's startDate as the base
    // For day-of-week schedules, use the later of today or schedule startDate
    const isIntervalSchedule = schedule.scheduleJobTypes?.some(jt => jt.startsWith('INTERVAL_')) || 
                                (schedule.interval && schedule.interval > 0);
    
    if (isIntervalSchedule) {
      // For intervals, use schedule startDate as the base (even if in the past, 
      // we'll calculate forward from there)
      effectiveStartDate = scheduleStartDate;
    } else {
      // For day-of-week, use the later date
      if (scheduleStartDate > effectiveStartDate) {
        effectiveStartDate = scheduleStartDate;
      }
    }
  }

  // Normalize endDate to end of day for comparison
  const effectiveEndDate = new Date(endDate);
  effectiveEndDate.setHours(23, 59, 59, 999);

  // Handle different schedule types
  let calculatedDates = false;
  
  if (schedule.scheduleJobTypes && schedule.scheduleJobTypes.length > 0) {
    const jobType = schedule.scheduleJobTypes[0];
    
    if (jobType.startsWith('INTERVAL_')) {
      // Interval-based schedule (e.g., every 14 days)
      const interval = parseInt(jobType.replace('INTERVAL_', ''), 10);
      if (!isNaN(interval) && interval > 0) {
        dates.push(...calculateIntervalDates(effectiveStartDate, effectiveEndDate, interval, schedule.endDate));
        calculatedDates = true;
      }
    } else if (jobType.startsWith('DAY_OF_WEEK_')) {
      // Day of week schedule (e.g., every Wednesday)
      const dayOfWeek = parseInt(jobType.replace('DAY_OF_WEEK_', ''), 10);
      if (!isNaN(dayOfWeek) && dayOfWeek >= 0 && dayOfWeek <= 6) {
        dates.push(...calculateDayOfWeekDates(effectiveStartDate, effectiveEndDate, dayOfWeek, schedule.endDate));
        calculatedDates = true;
      }
    }
  }
  
  // Try to extract from repeat object if available (check this before fallback to interval)
  if (!calculatedDates && schedule.repeat) {
    const repeat = schedule.repeat;
    // Only use repeat object if it actually has repeat configuration
    // Skip if repeat indicates "does not repeat" (e.g., repeat.type === 'NONE' or similar)
    const hasRepeatConfig = (repeat.interval && typeof repeat.interval === 'number' && repeat.interval > 0) ||
                           (repeat.daysOfWeek && Array.isArray(repeat.daysOfWeek) && repeat.daysOfWeek.length > 0);
    
    if (hasRepeatConfig) {
      // Check for interval in repeat object
      if (repeat.interval && typeof repeat.interval === 'number' && repeat.interval > 0) {
        dates.push(...calculateIntervalDates(effectiveStartDate, effectiveEndDate, repeat.interval, schedule.endDate));
        calculatedDates = true;
      }
      // Check for daysOfWeek in repeat object
      else if (repeat.daysOfWeek && Array.isArray(repeat.daysOfWeek) && repeat.daysOfWeek.length > 0) {
        // Handle multiple days of week
        for (const dayOfWeek of repeat.daysOfWeek) {
          if (typeof dayOfWeek === 'number' && dayOfWeek >= 0 && dayOfWeek <= 6) {
            dates.push(...calculateDayOfWeekDates(effectiveStartDate, effectiveEndDate, dayOfWeek, schedule.endDate));
          }
        }
        // Remove duplicates and sort
        dates = [...new Set(dates)].sort();
        calculatedDates = true;
      }
    }
  }
  
  // Fallback to interval if scheduleJobTypes not available or didn't match
  // This is checked AFTER repeat object to ensure we use the most specific data source
  // Always check interval as fallback, even if repeat object exists (in case repeat says "does not repeat")
  if (!calculatedDates && schedule.interval && schedule.interval > 0) {
    dates.push(...calculateIntervalDates(effectiveStartDate, effectiveEndDate, schedule.interval, schedule.endDate));
    calculatedDates = true;
  }
  
  // Last resort: Try to parse interval from summary string (e.g., "Every 30 days")
  if (!calculatedDates && schedule.summary) {
    const summaryMatch = schedule.summary.match(/every\s+(\d+)\s+days?/i);
    if (summaryMatch) {
      const interval = parseInt(summaryMatch[1], 10);
      if (!isNaN(interval) && interval > 0) {
        dates.push(...calculateIntervalDates(effectiveStartDate, effectiveEndDate, interval, schedule.endDate));
        calculatedDates = true;
      }
    }
  }

  // Debug: Log if no dates were calculated
  if (dates.length === 0 && schedule.source === 'rachio') {
    console.warn('No dates calculated for schedule:', {
      id: schedule.id,
      name: schedule.name,
      scheduleJobTypes: schedule.scheduleJobTypes,
      interval: schedule.interval,
      repeat: schedule.repeat,
      summary: schedule.summary,
      startDate: schedule.startDate,
      startDateFormatted: schedule.startDate ? new Date(schedule.startDate).toISOString() : null,
      endDate: schedule.endDate,
      endDateFormatted: schedule.endDate ? new Date(schedule.endDate).toISOString() : null,
      enabled: schedule.enabled,
      effectiveStartDate: effectiveStartDate.toISOString(),
      effectiveEndDate: effectiveEndDate.toISOString(),
      // Log full schedule object to debug
      fullSchedule: schedule,
    });
  }
  
  // Debug: Log successful date calculations
  if (dates.length > 0 && schedule.source === 'rachio') {
    console.log(`[DEBUG] Calculated ${dates.length} dates for schedule "${schedule.name}":`, {
      scheduleJobTypes: schedule.scheduleJobTypes,
      interval: schedule.interval,
      summary: schedule.summary,
      startDate: schedule.startDate ? new Date(schedule.startDate).toISOString() : null,
      endDate: schedule.endDate ? new Date(schedule.endDate).toISOString() : null,
      firstDate: dates[0],
      lastDate: dates[dates.length - 1],
      allDates: dates.slice(0, 10), // Show first 10 dates
    });
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
  currentDate.setHours(0, 0, 0, 0); // Normalize to start of day
  
  // Normalize endDate to end of day
  let effectiveEndDate = new Date(endDate);
  effectiveEndDate.setHours(23, 59, 59, 999);
  
  if (scheduleEndDate) {
    // Rachio API returns timestamps in milliseconds (not seconds)
    const scheduleEnd = new Date(scheduleEndDate);
    scheduleEnd.setHours(23, 59, 59, 999);
    if (scheduleEnd < effectiveEndDate) {
      effectiveEndDate = scheduleEnd;
    }
  }

  // Only include dates that are >= today (don't show past occurrences)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Start from the schedule's startDate and calculate forward
  // Skip past occurrences and only include future ones
  while (currentDate < today) {
    const nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + intervalDays);
    currentDate.setTime(nextDate.getTime());
  }

  // Add all occurrences from today forward
  while (currentDate <= effectiveEndDate) {
    dates.push(formatDate(currentDate));
    const nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + intervalDays);
    currentDate.setTime(nextDate.getTime());
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
  currentDate.setHours(0, 0, 0, 0); // Normalize to start of day
  
  let effectiveEndDate = new Date(endDate);
  effectiveEndDate.setHours(23, 59, 59, 999); // Normalize to end of day
  
  if (scheduleEndDate) {
    // Rachio API returns timestamps in milliseconds (not seconds)
    const scheduleEnd = new Date(scheduleEndDate);
    scheduleEnd.setHours(23, 59, 59, 999);
    if (scheduleEnd < effectiveEndDate) {
      effectiveEndDate = scheduleEnd;
    }
  }

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
  nextDate.setHours(0, 0, 0, 0);

  // Add all subsequent occurrences
  while (nextDate <= effectiveEndDate) {
    dates.push(formatDate(nextDate));
    const nextWeek = new Date(nextDate);
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextDate.setTime(nextWeek.getTime());
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
