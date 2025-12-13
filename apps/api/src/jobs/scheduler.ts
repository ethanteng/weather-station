import * as cron from 'node-cron';
import { pollWeatherData } from './weatherPoll';
import { pollRachioData } from './rachioPoll';
import { evaluateRules } from '../automation/engine';

let weatherJob: cron.ScheduledTask | null = null;
let rachioJob: cron.ScheduledTask | null = null;
let automationJob: cron.ScheduledTask | null = null;

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

  // Rachio polling: every 15 minutes
  rachioJob = cron.schedule('*/15 * * * *', async () => {
    console.log('Running Rachio poll job...');
    await pollRachioData();
  }, {
    scheduled: true,
    timezone: 'America/Los_Angeles',
  });

  // Automation evaluation: every 5 minutes
  automationJob = cron.schedule('*/5 * * * *', async () => {
    console.log('Running automation evaluation job...');
    await evaluateRules();
  }, {
    scheduled: true,
    timezone: 'America/Los_Angeles',
  });

  console.log('Job scheduler started');
  console.log('  - Weather poll: every 5 minutes');
  console.log('  - Rachio poll: every 15 minutes');
  console.log('  - Automation evaluation: every 5 minutes');
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
  console.log('Job scheduler stopped');
}

