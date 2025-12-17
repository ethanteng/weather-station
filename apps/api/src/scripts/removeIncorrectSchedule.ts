/**
 * Script to remove incorrect schedule entries from database
 * Specifically removes "All Other Zones (Backyard) 3:00 AM" entry that was incorrectly classified as a schedule
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

const prisma = new PrismaClient();

async function removeIncorrectSchedule() {
  try {
    console.log('Searching for incorrect schedule entry...');
    
    // Find audit log entries for schedule runs on Dec 17, 2025 around 3:00 AM PST (11:00 UTC)
    // Looking for Zone 6 (Backyard) entries or "All Other Zones" schedule
    const startDate = new Date('2025-12-17T11:00:00Z'); // 3:00 AM PST = 11:00 UTC
    const endDate = new Date('2025-12-17T11:30:00Z');
    
    const scheduleEntries = await prisma.auditLog.findMany({
      where: {
        source: 'rachio_schedule',
        action: 'rachio_schedule_ran',
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
    });
    
    console.log(`Found ${scheduleEntries.length} schedule entry/entries in the time window (3:00 AM PST)`);
    
    // Find entries that match:
    // 1. Schedule name contains "All Other Zones" OR
    // 2. Zone 6 is in the zones list
    const matchingEntries = scheduleEntries.filter(entry => {
      const details = entry.details as any;
      const scheduleName = (details.scheduleName || '').toLowerCase();
      
      // Check if schedule name matches
      if (scheduleName.includes('all other zones')) {
        return true;
      }
      
      // Check if Zone 6 is in the zones
      if (details.zones && Array.isArray(details.zones)) {
        return details.zones.some((z: any) => 
          z.zoneName === 'Zone 6' || 
          z.zoneId === 'b2b58b28-cce5-4bce-8dc4-a70840c9303e' // Zone 6 ID from logs
        );
      }
      
      return false;
    });
    
    console.log(`Found ${matchingEntries.length} matching entry/entries`);
    
    if (matchingEntries.length === 0) {
      console.log('\nNo matching entries found. Listing all schedule entries in time window:');
      scheduleEntries.forEach(entry => {
        const details = entry.details as any;
        console.log(`  Entry ID: ${entry.id}`);
        console.log(`    Schedule: ${details.scheduleName || 'Unknown'}`);
        console.log(`    Timestamp: ${entry.timestamp.toISOString()}`);
        console.log(`    Zones:`, details.zones?.map((z: any) => `${z.zoneName} (${z.durationMinutes}min)`).join(', ') || 'None');
        console.log('');
      });
      console.log('Please check the entry IDs above and manually delete if needed.');
      return;
    }
    
    // Delete the entries and their associated watering events
    for (const entry of matchingEntries) {
      const details = entry.details as any;
      console.log(`\nDeleting entry: ${entry.id}`);
      console.log(`  Schedule: ${details.scheduleName || 'Unknown'}`);
      console.log(`  Timestamp: ${entry.timestamp.toISOString()}`);
      console.log(`  Zones:`, details.zones?.map((z: any) => `${z.zoneName} (${z.zoneId})`).join(', ') || 'None');
      
      // Get watering event IDs from the audit log entry
      const wateringEventIds = details.wateringEventIds || [];
      
      // Delete the audit log entry
      await prisma.auditLog.delete({
        where: { id: entry.id },
      });
      console.log(`  ✓ Deleted audit log entry`);
      
      // Optionally delete the watering events (they might be needed for other purposes)
      // For now, we'll just update them to note they were incorrectly classified
      if (wateringEventIds.length > 0) {
        console.log(`  Found ${wateringEventIds.length} associated watering event(s)`);
        // We could delete them, but let's keep them for now and just remove the audit log
        // If you want to delete them too, uncomment:
        // await prisma.wateringEvent.deleteMany({
        //   where: { id: { in: wateringEventIds } },
        // });
      }
    }
    
    console.log(`\n✓ Successfully removed ${matchingEntries.length} incorrect schedule entry/entries`);
  } catch (error) {
    console.error('Error removing incorrect schedule entry:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

removeIncorrectSchedule();
