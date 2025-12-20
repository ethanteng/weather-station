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

    // Parse weather data from the Ecowitt API v3 response structure
    const parsed = client.parseWeatherData(deviceData);

    // Store in database
    await prisma.weatherReading.create({
      data: {
        temperature: parsed.temperature,
        humidity: parsed.humidity,
        pressure: parsed.pressure,
        rain1h: parsed.rain1h,
        rain24h: parsed.rain24h,
        rainTotal: parsed.rainTotal,
        rainRate: parsed.rainRate,
        soilMoisture: parsed.soilMoisture, // Backward compatibility
        soilMoistureValues: parsed.soilMoistureValues || undefined,
        rawPayload: deviceData as unknown as object,
      },
    });

    // Create/update SoilMoistureSensor records for detected sensors
    if (parsed.soilMoistureValues) {
      for (const channelKey of Object.keys(parsed.soilMoistureValues)) {
        // Extract channel number from "soil_ch1" -> 1
        const channelMatch = channelKey.match(/soil_ch(\d+)/);
        if (channelMatch) {
          const channel = parseInt(channelMatch[1], 10);
          
          // Check if sensor already exists
          const existingSensor = await prisma.soilMoistureSensor.findUnique({
            where: { channel },
          });

          if (existingSensor) {
            // Update existing sensor (keep name and enabled status)
            await prisma.soilMoistureSensor.update({
              where: { channel },
              data: {
                updatedAt: new Date(),
              },
            });
          } else {
            // Create new sensor with default name
            await prisma.soilMoistureSensor.create({
              data: {
                channel,
                name: `Soil Sensor ${channel}`,
                enabled: true,
              },
            });
            console.log(`Created new soil moisture sensor: channel ${channel}`);
          }
        }
      }
    }

    console.log('Weather data poll completed successfully', {
      temperature: parsed.temperature,
      humidity: parsed.humidity,
      rain24h: parsed.rain24h,
      soilMoisture: parsed.soilMoisture,
      soilMoistureSensors: parsed.soilMoistureValues ? Object.keys(parsed.soilMoistureValues).length : 0,
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

