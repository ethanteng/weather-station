/**
 * Seed script for initial data
 * Run manually after first Rachio sync: npm run db:seed --workspace=apps/api
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seed script - no initial data needed');
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

