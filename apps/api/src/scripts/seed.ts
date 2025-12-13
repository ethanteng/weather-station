/**
 * Seed script for initial data
 * Run manually after first Rachio sync: npm run db:seed --workspace=apps/api
 */

// Load environment variables from root .env file
import { config } from 'dotenv';
import { resolve } from 'path';

// Try to load .env from root directory (workspace root)
// When running from apps/api, go up 2 levels; when from workspace root, use current dir
const rootEnv = resolve(process.cwd(), '../../.env');
const currentEnv = resolve(process.cwd(), '.env');
config({ path: rootEnv });
config({ path: currentEnv });

import { PrismaClient } from '@prisma/client';
import {
  RAIN_DELAY_THRESHOLD_INCHES,
  RAIN_DELAY_DURATION_HOURS,
  SOIL_MOISTURE_HIGH_THRESHOLD_PERCENT,
  SOIL_MOISTURE_LOW_THRESHOLD_PERCENT,
  DRY_WATERING_DURATION_MINUTES,
  DRY_RAIN_THRESHOLD_INCHES,
} from '../automation/constants';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding automation rules...');

  // Check if rules already exist
  const existingRules = await prisma.automationRule.findMany();
  if (existingRules.length > 0) {
    console.log(`Found ${existingRules.length} existing rules, skipping seed`);
    return;
  }

  // Create default automation rules
  const defaultRules = [
    {
      name: 'Rainy Day Pause',
      enabled: true,
      conditions: {
        rain24h: { operator: '>=', value: RAIN_DELAY_THRESHOLD_INCHES },
      },
      actions: {
        type: 'set_rain_delay',
        hours: RAIN_DELAY_DURATION_HOURS,
      },
    },
    {
      name: 'Too Wet: Skip',
      enabled: true,
      conditions: {
        soilMoisture: { operator: '>=', value: SOIL_MOISTURE_HIGH_THRESHOLD_PERCENT },
      },
      actions: {
        type: 'set_rain_delay',
        hours: 24,
      },
    },
    {
      name: 'Too Dry: Boost',
      enabled: true,
      conditions: {
        soilMoisture: { operator: '<=', value: SOIL_MOISTURE_LOW_THRESHOLD_PERCENT },
        rain24h: { operator: '<', value: DRY_RAIN_THRESHOLD_INCHES },
      },
      actions: {
        type: 'run_zone',
        minutes: DRY_WATERING_DURATION_MINUTES,
      },
    },
  ];

  for (const rule of defaultRules) {
    await prisma.automationRule.create({
      data: {
        name: rule.name,
        enabled: rule.enabled,
        conditions: rule.conditions as object,
        actions: rule.actions as object,
      },
    });
    console.log(`Created rule: ${rule.name}`);
  }

  console.log('Automation rules seeded successfully');
  console.log('Rachio devices and zones will be populated automatically by the polling job');
  console.log('Weather data will be populated automatically by the weather polling job');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

