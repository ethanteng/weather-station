/**
 * Script to remove all schedule-related data from database
 * Removes all schedule audit logs and watering events so they can be re-pulled with corrected logic
 * Run with: npm run db:remove-incorrect-schedule --workspace=apps/api
 */

// Load environment variables from root .env file BEFORE importing PrismaClient
import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

// Try multiple possible locations for .env file
const possibleEnvPaths = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
  resolve(process.cwd(), '../../../.env'),
];

let envLoaded = false;
for (const envPath of possibleEnvPaths) {
  if (existsSync(envPath)) {
    const result = config({ path: envPath });
    if (result.error) {
      console.error(`Error loading .env from ${envPath}:`, result.error);
    } else {
      console.log(`Loaded .env from: ${envPath}`);
      envLoaded = true;
      break;
    }
  }
}

if (!envLoaded) {
  config();
}

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not found in environment variables');
  process.exit(1);
}

import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';

const prisma = new PrismaClient();

async function removeIncorrectSchedule() {
  try {
    console.log('Searching for all schedule-related data...');
    
    // Find all schedule audit log entries
    const scheduleAuditLogs = await prisma.auditLog.findMany({
      where: {
        source: 'rachio_schedule',
        action: 'rachio_schedule_ran',
      },
    });
    
    // Find all schedule watering events
    const scheduleWateringEvents = await prisma.wateringEvent.findMany({
      where: {
        source: 'schedule',
      },
    });
    
    console.log(`\nFound ${scheduleAuditLogs.length} schedule audit log entry/entries`);
    console.log(`Found ${scheduleWateringEvents.length} schedule watering event(s)`);
    
    if (scheduleAuditLogs.length === 0 && scheduleWateringEvents.length === 0) {
      console.log('\nNo schedule data found. Nothing to clean up.');
      return;
    }
    
    // Show summary of what will be deleted
    if (scheduleAuditLogs.length > 0) {
      console.log('\nSchedule audit logs to be deleted:');
      scheduleAuditLogs.forEach(entry => {
        const details = entry.details as any;
        console.log(`  - ${details.scheduleName || 'Unknown'} at ${entry.timestamp.toISOString()}`);
      });
    }
    
    if (scheduleWateringEvents.length > 0) {
      console.log(`\n${scheduleWateringEvents.length} watering event(s) to be deleted`);
    }
    
    // Prompt for confirmation
    console.log('\n⚠️  WARNING: This will delete ALL schedule-related data.');
    console.log('After deletion, rachioPoll.ts will re-process events with the new simplified logic.');
    console.log('\nType "yes" to confirm deletion, or anything else to cancel:');
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    const answer = await new Promise<string>((resolve) => {
      rl.question('', (input: string) => {
        resolve(input.trim().toLowerCase());
      });
    });
    rl.close();
    
    if (answer !== 'yes') {
      console.log('\nCancelled. No data was deleted.');
      return;
    }
    
    console.log('\nDeleting schedule data...');
    
    // Delete all schedule audit logs
    let deletedAuditLogs = 0;
    for (const entry of scheduleAuditLogs) {
      await prisma.auditLog.delete({
        where: { id: entry.id },
      });
      deletedAuditLogs++;
    }
    
    // Delete all schedule watering events
    const deletedWateringEvents = await prisma.wateringEvent.deleteMany({
      where: {
        source: 'schedule',
      },
    });
    
    console.log(`\n✓ Successfully deleted ${deletedAuditLogs} schedule audit log entry/entries`);
    console.log(`✓ Successfully deleted ${deletedWateringEvents.count} schedule watering event(s)`);
    console.log('\nSchedule data has been cleaned up. rachioPoll.ts will re-process events with the new logic.');
  } catch (error) {
    console.error('Error removing incorrect schedule entry:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

removeIncorrectSchedule();
