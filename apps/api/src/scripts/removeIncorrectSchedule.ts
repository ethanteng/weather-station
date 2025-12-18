/**
 * Script to remove all schedule-related data from database
 * Removes all schedule audit logs and watering events so they can be re-pulled with corrected logic
 * Also removes watering events with category: undefined or summary containing "Quick Run"
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
    
    // Find watering events with category: undefined or summary containing "Quick Run"
    // Rachio events have fields like: id, category, type, subType, summary, eventDate
    const allWateringEvents = await prisma.wateringEvent.findMany({
      include: {
        zone: {
          select: {
            name: true,
          },
        },
      },
    });
    
    // Debug: Log sample of events to help diagnose
    if (allWateringEvents.length > 0) {
      console.log('\nDebug: Sample of watering events:');
      const sampleEvents = allWateringEvents.slice(0, 10);
      sampleEvents.forEach(event => {
        const rawPayload = event.rawPayload as any;
        const hasCategory = rawPayload && typeof rawPayload === 'object' && 'category' in rawPayload;
        const categoryValue = hasCategory ? rawPayload.category : 'N/A';
        const summaryPreview = rawPayload?.summary ? rawPayload.summary.substring(0, 50) : 'N/A';
        console.log(`  - Source: ${event.source}, Zone: ${event.zone.name}, Has category field: ${hasCategory}, Category: ${categoryValue}, Summary: ${summaryPreview}`);
      });
    }
    
    const invalidRachioEvents = allWateringEvents.filter(event => {
      const rawPayload = event.rawPayload as any;
      
      // Check if this looks like a Rachio API event (has Rachio event structure)
      // Rachio events typically have: id, category, type, subType, summary, eventDate
      // We check for 'category' field specifically to match the API endpoint logic
      const isRachioEvent = rawPayload && 
        typeof rawPayload === 'object' && 
        'category' in rawPayload;
      
      if (isRachioEvent) {
        // Exclude events with undefined or null category (matches API endpoint filter)
        // Note: category can be explicitly undefined, null, or the property might not exist
        const categoryValue = rawPayload.category;
        if (categoryValue === undefined || categoryValue === null) {
          return true;
        }
        
        // Exclude events where summary includes "Quick Run" (case-insensitive)
        if (rawPayload.summary && typeof rawPayload.summary === 'string') {
          if (rawPayload.summary.toLowerCase().includes('quick run')) {
            return true;
          }
        }
      }
      
      return false;
    });
    
    console.log(`\nFound ${scheduleAuditLogs.length} schedule audit log entry/entries`);
    console.log(`Found ${scheduleWateringEvents.length} schedule watering event(s)`);
    console.log(`Found ${invalidRachioEvents.length} invalid Rachio event(s) (category: undefined or "Quick Run")`);
    
    if (scheduleAuditLogs.length === 0 && scheduleWateringEvents.length === 0 && invalidRachioEvents.length === 0) {
      console.log('\nNo data found. Nothing to clean up.');
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
      console.log(`\n${scheduleWateringEvents.length} schedule watering event(s) to be deleted`);
    }
    
    if (invalidRachioEvents.length > 0) {
      console.log(`\nInvalid Rachio events to be deleted:`);
      invalidRachioEvents.forEach(event => {
        const rawPayload = event.rawPayload as any;
        const reason = rawPayload?.category === undefined 
          ? 'category: undefined' 
          : 'summary contains "Quick Run"';
        console.log(`  - Zone: ${event.zone.name || event.zoneId}, ${event.timestamp.toISOString()}, Reason: ${reason}`);
      });
    }
    
    // Prompt for confirmation
    console.log('\n⚠️  WARNING: This will delete:');
    console.log('  - ALL schedule-related data (audit logs and watering events)');
    console.log('  - Invalid Rachio events (category: undefined or "Quick Run")');
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
    
    console.log('\nDeleting data...');
    
    // Delete all schedule audit logs
    let deletedAuditLogs = 0;
    for (const entry of scheduleAuditLogs) {
      await prisma.auditLog.delete({
        where: { id: entry.id },
      });
      deletedAuditLogs++;
    }
    
    // Delete all schedule watering events
    const deletedScheduleWateringEvents = await prisma.wateringEvent.deleteMany({
      where: {
        source: 'schedule',
      },
    });
    
    // Delete invalid Rachio events
    let deletedInvalidEvents = 0;
    for (const event of invalidRachioEvents) {
      await prisma.wateringEvent.delete({
        where: { id: event.id },
      });
      deletedInvalidEvents++;
    }
    
    console.log(`\n✓ Successfully deleted ${deletedAuditLogs} schedule audit log entry/entries`);
    console.log(`✓ Successfully deleted ${deletedScheduleWateringEvents.count} schedule watering event(s)`);
    console.log(`✓ Successfully deleted ${deletedInvalidEvents} invalid Rachio event(s)`);
    console.log('\nData has been cleaned up. rachioPoll.ts will re-process events with the new logic.');
  } catch (error) {
    console.error('Error removing incorrect schedule entry:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

removeIncorrectSchedule();
