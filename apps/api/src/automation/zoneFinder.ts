import { PrismaClient } from '@prisma/client';
import { LAWN_ZONE_PATTERNS } from './constants';

const prisma = new PrismaClient();

/**
 * Find the lawn zone to use for automation
 * Returns the first zone matching lawn patterns, or the first enabled zone
 */
export async function findLawnZone(): Promise<string | null> {
  const zones = await prisma.rachioZone.findMany({
    where: {
      enabled: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  if (zones.length === 0) {
    return null;
  }

  // Try to find a zone matching lawn patterns
  for (const zone of zones) {
    const nameLower = zone.name.toLowerCase();
    if (LAWN_ZONE_PATTERNS.some(pattern => nameLower.includes(pattern))) {
      return zone.id;
    }
  }

  // Fallback to first enabled zone
  return zones[0].id;
}

