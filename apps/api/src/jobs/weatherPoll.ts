import { PrismaClient } from '@prisma/client';
import { EcowittClient } from '../clients/ecowitt';

const prisma = new PrismaClient();

export async function pollWeatherData(): Promise<void> {
  const applicationKey = process.env.ECOWITT_APPLICATION_KEY;
  const apiKey = process.env.ECOWITT_API_KEY;

  if (!applicationKey || !apiKey) {
    console.error('Ecowitt credentials not configured');
    return;
  }

  const client = new EcowittClient(applicationKey, apiKey);

  try {
    console.log('Starting weather data poll...');

    // Get device list
    const devices = await client.getDeviceList();
    
    if (devices.length === 0) {
      console.warn('No Ecowitt devices found');
      return;
    }

    // For Phase 1, use the first device
    // TODO: Support multiple devices if needed
    const device = devices[0];
    
    // Extract MAC address from device object
    // Ecowitt API may return MAC in various formats: mac, macAddress, mac_address, device_mac
    const macAddress = 
      (device as any).mac || 
      (device as any).macAddress || 
      (device as any).mac_address || 
      (device as any).device_mac || 
      device.id; // Fallback to id if no MAC field found
    
    console.log(`Fetching data for device: ${device.id} (${device.name}), MAC: ${macAddress}`);
    console.log('Full device object:', JSON.stringify(device, null, 2));

    // Get device data using MAC address
    const deviceData = await client.getDeviceData(macAddress);

    // Parse weather data
    const parsed = client.parseWeatherData(deviceData.sensors || {});

    // Store in database
    await prisma.weatherReading.create({
      data: {
        temperature: parsed.temperature,
        humidity: parsed.humidity,
        pressure: parsed.pressure,
        rain1h: parsed.rain1h,
        rain24h: parsed.rain24h,
        rainTotal: parsed.rainTotal,
        soilMoisture: parsed.soilMoisture,
        rawPayload: deviceData as unknown as object,
      },
    });

    console.log('Weather data poll completed successfully', {
      temperature: parsed.temperature,
      humidity: parsed.humidity,
      rain24h: parsed.rain24h,
      soilMoisture: parsed.soilMoisture,
    });
  } catch (error) {
    console.error('Error polling weather data:', error);
    
    // Log error to audit log
    await prisma.auditLog.create({
      data: {
        action: 'weather_poll_error',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        },
        source: 'weather_poll_job',
      },
    });
  }
}

