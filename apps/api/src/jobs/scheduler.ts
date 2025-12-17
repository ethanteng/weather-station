import * as cron from 'node-cron';
import { pollWeatherData } from './weatherPoll';
import { pollRachioData } from './rachioPoll';
import { evaluateRules } from '../automation/engine';
import { uploadWeatherUnderground } from './wundergroundUpload';

let weatherJob: cron.ScheduledTask | null = null;
let rachioJob: cron.ScheduledTask | null = null;
let automationJob: cron.ScheduledTask | null = null;
let wundergroundJob: cron.ScheduledTask | null = null;

export function startScheduler(): void {
  console.log('Starting job scheduler...');

  // Weather polling: every 5 minutes
  weatherJob = cron.schedule('*/5 * * * *', async () => {
    console.log('Running weather poll job...');
    await pollWeatherData();
  }, {
    scheduled: true,
    timezone: 'America/Los_Angeles', // Adjust as needed
  });

  // Rachio polling: every 6 hours (reduced to avoid rate limits)
  // Rachio API allows 3,500 requests/day. At 6hr intervals = 4 requests/day for polling
  rachioJob = cron.schedule('0 */6 * * *', async () => {
    console.log('Running Rachio poll job...');
    await pollRachioData();
  }, {
    scheduled: true,
    timezone: 'America/Los_Angeles',
  });

  // Automation evaluation: twice daily (8 AM and 8 PM)
  automationJob = cron.schedule('0 8,20 * * *', async () => {
    console.log('Running automation evaluation job...');
    await evaluateRules();
  }, {
    scheduled: true,
    timezone: 'America/Los_Angeles',
  });

  // Weather Underground upload: configurable interval (default 5 minutes)
  const wuEnabled = process.env.WU_ENABLED === 'true';
  if (wuEnabled) {
    const wuIntervalSeconds = parseInt(process.env.WU_INTERVAL_SECONDS || '300', 10);
    const wuIntervalMinutes = Math.max(1, Math.floor(wuIntervalSeconds / 60));
    
    // Create cron expression based on interval
    // Note: */N syntax only works correctly for divisors of 60 (1,2,3,4,5,6,10,12,15,20,30)
    //   For other values >= 30, it wraps around hour boundaries incorrectly
    //   Example: */45 runs at 0 and 45 (not every 45 minutes), */59 runs at 0 and 59
    let cronExpression: string;
    let intervalDescription: string;
    
    // Check if interval is a divisor of 60 (works correctly with */N syntax)
    const divisorsOf60 = [1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30];
    const isDivisorOf60 = divisorsOf60.includes(wuIntervalMinutes);
    
    if (isDivisorOf60) {
      // Divisors of 60 work correctly with */N syntax
      cronExpression = `*/${wuIntervalMinutes} * * * *`;
      intervalDescription = `every ${wuIntervalMinutes} minutes`;
    } else if (wuIntervalMinutes < 30) {
      // For non-divisors < 30, use */N anyway (runs multiple times per hour, close enough)
      cronExpression = `*/${wuIntervalMinutes} * * * *`;
      intervalDescription = `every ${wuIntervalMinutes} minutes`;
      console.warn(
        `WU_INTERVAL_SECONDS=${wuIntervalSeconds} (${wuIntervalMinutes} minutes) is not a divisor of 60. ` +
        `Cron will run at minutes 0, ${wuIntervalMinutes}, ${(wuIntervalMinutes * 2) % 60}, etc. ` +
        `For exact intervals, use divisors of 60 (1,2,3,4,5,6,10,12,15,20,30).`
      );
    } else {
      // For intervals >= 30 that aren't divisors, round to nearest hour
      const wuIntervalHours = Math.round(wuIntervalMinutes / 60);
      const actualHours = Math.max(1, wuIntervalHours); // Ensure at least 1 hour
      cronExpression = `0 */${actualHours} * * *`;
      intervalDescription = `every ${actualHours} hour${actualHours !== 1 ? 's' : ''}`;
      
      console.warn(
        `WU_INTERVAL_SECONDS=${wuIntervalSeconds} (${wuIntervalMinutes} minutes) rounded to ${actualHours} hour(s) ` +
        `for cron scheduling. Use intervals that are divisors of 60 (1,2,3,4,5,6,10,12,15,20,30) or multiples of 60 minutes for exact timing.`
      );
    }
    
    wundergroundJob = cron.schedule(cronExpression, async () => {
      console.log('Running Weather Underground upload job...');
      await uploadWeatherUnderground();
    }, {
      scheduled: true,
      timezone: 'America/Los_Angeles',
    });
    
    console.log(`Job scheduler started`);
    console.log('  - Weather poll: every 5 minutes');
    console.log('  - Rachio poll: every 6 hours');
    console.log('  - Automation evaluation: twice daily (8 AM and 8 PM)');
    console.log(`  - Weather Underground upload: ${intervalDescription}`);
  } else {
    console.log('Job scheduler started');
    console.log('  - Weather poll: every 5 minutes');
    console.log('  - Rachio poll: every 6 hours');
    console.log('  - Automation evaluation: twice daily (8 AM and 8 PM)');
    console.log('  - Weather Underground upload: disabled');
  }
}

export function stopScheduler(): void {
  if (weatherJob) {
    weatherJob.stop();
    weatherJob = null;
  }
  if (rachioJob) {
    rachioJob.stop();
    rachioJob = null;
  }
  if (automationJob) {
    automationJob.stop();
    automationJob = null;
  }
  if (wundergroundJob) {
    wundergroundJob.stop();
    wundergroundJob = null;
  }
  console.log('Job scheduler stopped');
}

