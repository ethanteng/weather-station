/**
 * Script to remove invalid manual watering events from database
 * Removes watering events where source: 'manual' AND category field is missing (invalid Rachio events)
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
    console.log('Searching for invalid manual watering events...');
    
    // Find all manual watering events
    const manualWateringEvents = await prisma.wateringEvent.findMany({
      where: {
        source: 'manual',
      },
      include: {
        zone: {
          select: {
            name: true,
          },
        },
      },
    });
    
    // Filter for invalid events: source: 'manual' AND no category field in rawPayload
    const invalidManualEvents = manualWateringEvents.filter(event => {
      const rawPayload = event.rawPayload as any;
      
      // Check if rawPayload has a 'category' field (indicating it's a valid Rachio event)
      // Invalid manual events don't have a category field
      const hasCategory = rawPayload && 
        typeof rawPayload === 'object' && 
        'category' in rawPayload;
      
      // Invalid if source is manual AND category field is missing
      return !hasCategory;
    });
    
    console.log(`\nFound ${manualWateringEvents.length} manual watering event(s) total`);
    console.log(`Found ${invalidManualEvents.length} invalid manual event(s) (source: manual, category: N/A)`);
    
    if (invalidManualEvents.length === 0) {
      console.log('\nNo invalid manual events found. Nothing to clean up.');
      return;
    }
    
    // Show summary of what will be deleted
    console.log(`\nInvalid manual events to be deleted:`);
    invalidManualEvents.forEach(event => {
      const rawPayload = event.rawPayload as any;
      const summaryPreview = rawPayload?.summary ? rawPayload.summary.substring(0, 50) : 'N/A';
      console.log(`  - Zone: ${event.zone.name || event.zoneId}, ${event.timestamp.toISOString()}, Duration: ${event.durationSec}s, Summary: ${summaryPreview}`);
    });
    
    // Prompt for confirmation
    console.log('\n⚠️  WARNING: This will delete invalid manual watering events.');
    console.log('These are events marked as "manual" but missing the category field (invalid Rachio events).');
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
    
    console.log('\nDeleting invalid manual events...');
    
    // Delete invalid manual events
    let deletedCount = 0;
    for (const event of invalidManualEvents) {
      await prisma.wateringEvent.delete({
        where: { id: event.id },
      });
      deletedCount++;
    }
    
    console.log(`\n✓ Successfully deleted ${deletedCount} invalid manual watering event(s)`);
    console.log('\nInvalid manual events have been cleaned up.');
  } catch (error) {
    console.error('Error removing incorrect schedule entry:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

removeIncorrectSchedule();
