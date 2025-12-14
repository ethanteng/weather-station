import { PrismaClient } from '@prisma/client';
import { RachioClient } from '../clients/rachio';

const prisma = new PrismaClient();

export async function pollRachioData(): Promise<void> {
  const apiKey = process.env.RACHIO_API_KEY;

  if (!apiKey) {
    console.error('Rachio API key not configured');
    return;
  }

  const client = new RachioClient(apiKey);

  try {
    console.log('Starting Rachio data poll...');

    // Get all devices with retry logic for rate limits
    let devices;
    try {
      devices = await client.getDevices();
    } catch (error: any) {
      // If we hit a rate limit, log and skip this poll
      if (error.message?.includes('429') || error.response?.status === 429) {
        console.warn('Rachio API rate limit hit, skipping this poll cycle');
        return;
      }
      throw error;
    }

    if (devices.length === 0) {
      console.warn('No Rachio devices found');
      return;
    }

    // Process each device
    for (const device of devices) {
      // Upsert device
      await prisma.rachioDevice.upsert({
        where: { id: device.id },
        update: {
          name: device.name,
          status: device.status,
          rawPayload: device as unknown as object,
        },
        create: {
          id: device.id,
          name: device.name,
          status: device.status,
          rawPayload: device as unknown as object,
        },
      });

      console.log(`Processed device: ${device.id} (${device.name})`);

      // Get zones for this device
      const zones = await client.getZones(device.id);

      // Upsert zones
      for (const zone of zones) {
        await prisma.rachioZone.upsert({
          where: { id: zone.id },
          update: {
            name: zone.name,
            enabled: zone.enabled,
            rawPayload: zone as unknown as object,
          },
          create: {
            id: zone.id,
            deviceId: device.id,
            name: zone.name,
            enabled: zone.enabled,
            rawPayload: zone as unknown as object,
          },
        });

        console.log(`  Processed zone: ${zone.id} (${zone.name})`);
      }
    }

    console.log('Rachio data poll completed successfully');
  } catch (error) {
    console.error('Error polling Rachio data:', error);

    // Log error to audit log
    await prisma.auditLog.create({
      data: {
        action: 'rachio_poll_error',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        },
        source: 'rachio_poll_job',
      },
    });
  }
}

