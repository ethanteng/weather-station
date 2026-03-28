'use client';

import { useEffect, useState } from 'react';
import { automationApi, AutomationRule, rachioApi, RachioZone, sensorApi, SoilMoistureSensor, SoilMoistureCondition } from '../lib/api';

export function RuleView({
  rule,
  onEdit,
  onToggle,
  onDelete,
  onDuplicate,
  onStartSchedule,
  onSkipSchedule,
}: {
  rule: AutomationRule;
  onEdit: () => void;
  onToggle: (id: string, enabled: boolean, source?: 'custom' | 'rachio') => void;
  onDelete: (id: string, source?: 'custom' | 'rachio') => void;
  onDuplicate: (rule: AutomationRule) => void;
  onStartSchedule?: (id: string) => void;
  onSkipSchedule?: (id: string) => void;
}) {
  const [actionDisplay, setActionDisplay] = useState<{ icon: string; label: string; value: string } | null>(null);
  const [rachioScheduleDisplay, setRachioScheduleDisplay] = useState<{ zones: Array<{ zoneId: string; name: string; duration: number; deviceName: string; imageUrl?: string | null; zoneNumber?: number | null }>; totalDuration: number } | null>(null);
  const [customRuleZonesDisplay, setCustomRuleZonesDisplay] = useState<{ zones: Array<{ zoneId: string; name: string; deviceName: string; imageUrl?: string | null; zoneNumber?: number | null; cooldownPeriodDays?: number | null }>; duration: number } | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [sensors, setSensors] = useState<SoilMoistureSensor[]>([]);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [isStartingSchedule, setIsStartingSchedule] = useState(false);
  const [isInEffect, setIsInEffect] = useState<boolean | null>(null);
  const isRachioSchedule = rule.source === 'rachio';

  // Fetch sensors for displaying names
  useEffect(() => {
    const fetchSensors = async () => {
      try {
        const sensorData = await sensorApi.getSensors();
        setSensors(sensorData);
      } catch (error) {
        console.error('Error fetching sensors:', error);
      }
    };
    fetchSensors();
  }, []);

  // Check if rule is currently in effect (only for custom rules with set_rain_delay action)
  useEffect(() => {
    if (isRachioSchedule || !rule.enabled || rule.actions.type !== 'set_rain_delay') {
      setIsInEffect(false);
      return;
    }

    const checkStatus = async () => {
      try {
        const status = await automationApi.checkRuleStatus(rule.id);
        setIsInEffect(status.inEffect);
      } catch (error) {
        console.error('Error checking rule status:', error);
        setIsInEffect(false);
      }
    };

    checkStatus();
  }, [rule.id, rule.enabled, rule.actions.type, isRachioSchedule]);

  // Formatting helper functions
  const formatInterval = (interval?: number, scheduleJobTypes?: string[], summary?: string): string => {
    // Use summary if available (e.g., "Every Wed at 9:05 AM")
    if (summary) return summary;
    
    // Parse from scheduleJobTypes if available
    if (scheduleJobTypes && scheduleJobTypes.length > 0) {
      const jobType = scheduleJobTypes[0];
      if (jobType.startsWith('INTERVAL_')) {
        const days = parseInt(jobType.replace('INTERVAL_', ''), 10);
        if (days === 1) return 'Every day';
        if (days === 7) return 'Every week';
        if (days === 14) return 'Every 14 days (2 weeks)';
        if (days === 21) return 'Every 21 days (3 weeks)';
        if (days === 30) return 'Every month';
        return `Every ${days} days`;
      }
      if (jobType.startsWith('DAY_OF_WEEK_')) {
        const dayNum = parseInt(jobType.replace('DAY_OF_WEEK_', ''), 10);
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return `Every ${days[dayNum]}`;
      }
    }
    
    // Fall back to interval number
    if (!interval) return 'Not set';
    if (interval === 1) return 'Every day';
    if (interval < 7) return `Every ${interval} days`;
    if (interval === 7) return 'Every week';
    if (interval < 14) return `Every ${interval} days (${Math.round(interval / 7)} weeks)`;
    if (interval === 14) return 'Every 14 days (2 weeks)';
    if (interval < 30) return `Every ${interval} days (${Math.round(interval / 7)} weeks)`;
    if (interval === 30) return 'Every month';
    return `Every ${interval} days`;
  };

  const formatStartTime = (startTime?: number, startHour?: number, startMinute?: number, operator?: string): string => {
    // Use startHour and startMinute if available
    if (startHour !== undefined && startMinute !== undefined) {
      const period = startHour >= 12 ? 'PM' : 'AM';
      const displayHours = startHour === 0 ? 12 : startHour > 12 ? startHour - 12 : startHour;
      const op = operator === 'AFTER' ? 'after' : 'at';
      return `Start ${op} ${displayHours}:${startMinute.toString().padStart(2, '0')} ${period}`;
    }
    
    // Handle seconds since midnight (0-86399)
    if (startTime !== undefined) {
      if (startTime < 86400) {
        const hours = Math.floor(startTime / 3600);
        const minutes = Math.floor((startTime % 3600) / 60);
        const period = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
        return `Start after ${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
      }
      // Handle timestamp - convert to time
      const date = new Date(startTime);
      return `Start after ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
    }
    
    return 'Not set';
  };

  const formatDateRange = (
    startDate?: number, 
    endDate?: number | null,
    startDay?: number,
    startMonth?: number,
    startYear?: number,
    scheduleJobTypes?: string[]
  ): { range: string; repeat: string } => {
    let startFormatted = 'Not set';
    
    // Use startDay/startMonth/startYear if available
    if (startDay !== undefined && startMonth !== undefined && startYear !== undefined) {
      const date = new Date(startYear, startMonth - 1, startDay);
      startFormatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } else if (startDate) {
      const start = new Date(startDate);
      startFormatted = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    
    if (startFormatted === 'Not set') {
      return { range: 'Not set', repeat: '' };
    }
    
    if (!endDate) {
      return { range: `${startFormatted} - Never`, repeat: 'Does not repeat' };
    }
    
    const end = new Date(endDate);
    const endFormatted = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    
    // Determine repeat status from scheduleJobTypes, repeat config, or interval
    let repeatText = 'Does not repeat';
    const rachioRule = rule as AutomationRule & { repeat?: any; interval?: number; scheduleJobTypes?: string[] };
    
    if (scheduleJobTypes && scheduleJobTypes.length > 0) {
      const jobType = scheduleJobTypes[0];
      if (jobType.startsWith('INTERVAL_')) {
        const days = parseInt(jobType.replace('INTERVAL_', ''), 10);
        if (days === 1) repeatText = 'Repeats daily';
        else if (days === 7) repeatText = 'Repeats weekly';
        else repeatText = `Repeats every ${days} days`;
      } else if (jobType.startsWith('DAY_OF_WEEK_')) {
        const dayNum = parseInt(jobType.replace('DAY_OF_WEEK_', ''), 10);
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        repeatText = `Repeats every ${days[dayNum]}`;
      }
    } else if (rachioRule.repeat) {
      if (rachioRule.repeat.type === 'DAILY') repeatText = 'Repeats daily';
      else if (rachioRule.repeat.type === 'WEEKLY') repeatText = 'Repeats weekly';
      else if (rachioRule.repeat.type === 'MONTHLY') repeatText = 'Repeats monthly';
      else if (rachioRule.interval && rachioRule.interval > 0) {
        repeatText = `Repeats every ${rachioRule.interval} days`;
      }
    } else if (rachioRule.interval && rachioRule.interval > 0) {
      repeatText = `Repeats every ${rachioRule.interval} days`;
    }
    
    return { range: `${startFormatted} - ${endFormatted}`, repeat: repeatText };
  };

  useEffect(() => {
    const loadActionDisplay = async () => {
      // Handle Rachio schedules differently
      if (isRachioSchedule && rule.scheduleZones) {
        try {
          // Fetch zone names with device names and images
          const devices = await rachioApi.getDevices();
          const zoneDeviceMap = new Map<string, string>(); // zoneId -> deviceName
          const zoneNameMap = new Map<string, string>(); // zoneId -> zoneName
          const zoneImageMap = new Map<string, string | null>(); // zoneId -> imageUrl
          const zoneNumberMap = new Map<string, number | null>(); // zoneId -> zoneNumber
          const allZones: RachioZone[] = [];
          
          // Build device and zone maps
          for (const device of devices) {
            if (device.zones) {
              allZones.push(...device.zones);
              device.zones.forEach(zone => {
                zoneDeviceMap.set(zone.id, device.name);
                zoneNameMap.set(zone.id, zone.name);
                zoneImageMap.set(zone.id, zone.imageUrl || null);
                zoneNumberMap.set(zone.id, zone.zoneNumber || null);
              });
            }
          }
          
          // Format schedule zones with names, durations, images, and zone numbers
          const formattedZones = rule.scheduleZones.map(sz => ({
            zoneId: sz.zoneId,
            name: zoneNameMap.get(sz.zoneId) || `Zone ${sz.zoneId.substring(0, 8)}`,
            duration: Math.round(sz.duration / 60), // Convert seconds to minutes
            deviceName: zoneDeviceMap.get(sz.zoneId) || rule.deviceName || 'Unknown Device',
            imageUrl: zoneImageMap.get(sz.zoneId) || null,
            zoneNumber: zoneNumberMap.get(sz.zoneId) || null,
          }));

          const totalDuration = rule.scheduleZones.reduce((sum, sz) => sum + sz.duration, 0);
          
          setRachioScheduleDisplay({
            zones: formattedZones,
            totalDuration: Math.round(totalDuration / 60),
          });
        } catch (error) {
          console.error('Error loading Rachio schedule display:', error);
        }
        return;
      }

      // Handle custom rules
      if (rule.actions.type === 'set_rain_delay') {
        let deviceInfo = '';
        if (rule.actions.deviceIds && rule.actions.deviceIds.length > 0) {
          try {
            // Fetch device names
            const devices = await rachioApi.getDevices();
            const selectedDevices = devices.filter(device => rule.actions.deviceIds?.includes(device.id));
            if (selectedDevices.length > 0) {
              const deviceNames = selectedDevices.map(d => d.name);
              deviceInfo = ` - ${deviceNames.join(', ')}`;
            } else {
              deviceInfo = ` - ${rule.actions.deviceIds.length} device(s)`;
            }
          } catch (error) {
            console.error('Error loading device names for rain delay:', error);
            deviceInfo = rule.actions.deviceIds.length > 0 ? ` - ${rule.actions.deviceIds.length} device(s)` : '';
          }
        } else {
          // No deviceIds means it applies to all devices
          deviceInfo = ' - All devices';
        }
        
        setActionDisplay({
          icon: '',
          label: 'Set Rain Delay',
          value: `${rule.actions.hours} hours${deviceInfo}`,
        });
        return;
      }
      if (rule.actions.type === 'run_zone') {
        let zoneDisplay = '';
        if (rule.actions.zoneIds && rule.actions.zoneIds.length > 0) {
          try {
            // Fetch zone names with device names and images
            const devices = await rachioApi.getDevices();
            const zoneDeviceMap = new Map<string, string>(); // zoneId -> deviceName
            const zoneNameMap = new Map<string, string>(); // zoneId -> zoneName
            const zoneImageMap = new Map<string, string | null>(); // zoneId -> imageUrl
            const zoneNumberMap = new Map<string, number | null>(); // zoneId -> zoneNumber
            const zoneCooldownMap = new Map<string, number | null>(); // zoneId -> cooldownPeriodDays
            const allZones: RachioZone[] = [];
            
            // Build device map and collect zones
            for (const device of devices) {
              if (device.zones) {
                allZones.push(...device.zones);
                device.zones.forEach(zone => {
                  zoneDeviceMap.set(zone.id, device.name);
                  zoneNameMap.set(zone.id, zone.name);
                  zoneImageMap.set(zone.id, zone.imageUrl || null);
                  zoneNumberMap.set(zone.id, zone.zoneNumber || null);
                  zoneCooldownMap.set(zone.id, zone.cooldownPeriodDays ?? null);
                });
              }
            }
            
            const selectedZones = allZones.filter(zone => rule.actions.zoneIds?.includes(zone.id));
            if (selectedZones.length > 0) {
              // Format as "Device Name - Zone Name" for text display
              const zoneStrings = selectedZones.map(z => {
                const deviceName = zoneDeviceMap.get(z.id) || 'Unknown Device';
                return `${deviceName} - ${z.name}`;
              });
              zoneDisplay = zoneStrings.join(', ');
              
              // Store zone data with images for visual display
              const zoneData = rule.actions.zoneIds.map(zoneId => {
                const zone = selectedZones.find(z => z.id === zoneId);
                return {
                  zoneId,
                  name: zoneNameMap.get(zoneId) || `Zone ${zoneId.substring(0, 8)}`,
                  deviceName: zoneDeviceMap.get(zoneId) || 'Unknown Device',
                  imageUrl: zoneImageMap.get(zoneId) || null,
                  zoneNumber: zoneNumberMap.get(zoneId) || null,
                  cooldownPeriodDays: zoneCooldownMap.get(zoneId) ?? null,
                };
              });
              
              setCustomRuleZonesDisplay({
                zones: zoneData,
                duration: rule.actions.minutes || 0,
              });
            } else {
              zoneDisplay = `${rule.actions.zoneIds.length} zone(s)`;
            }
          } catch (error) {
            zoneDisplay = `${rule.actions.zoneIds.length} zone(s)`;
          }
        } else {
          // Backward compatibility: no zoneIds means it uses the old "find lawn zone" logic
          zoneDisplay = 'Lawn Zone (auto)';
        }
        
        setActionDisplay({
          icon: '',
          label: 'Run Zone(s)',
          value: `${rule.actions.minutes} minutes${zoneDisplay ? ` - ${zoneDisplay}` : ''}`,
        });
        return;
      }
      setActionDisplay({ icon: '', label: 'Unknown', value: '' });
    };

    loadActionDisplay();
    // Reset custom rule zones display when rule changes
    if (!isRachioSchedule && rule.actions.type !== 'run_zone') {
      setCustomRuleZonesDisplay(null);
    }
  }, [rule.actions, rule.source, rule.scheduleZones, rule.deviceName, isRachioSchedule]);

  const formatConditions = () => {
    const conditions: Array<{ label: string; value: string }> = [];
    if (rule.conditions.rain24h) {
      conditions.push({
        label: 'Rain 24h',
        value: `${rule.conditions.rain24h.operator} ${rule.conditions.rain24h.value}"`,
      });
    }
    if (rule.conditions.soilMoisture) {
      // Check if it's the new format (has sensors array)
      if ('sensors' in rule.conditions.soilMoisture && Array.isArray(rule.conditions.soilMoisture.sensors)) {
        const sensorCondition = rule.conditions.soilMoisture as SoilMoistureCondition;
        const sensorStrings = sensorCondition.sensors.map(s => {
          // Find sensor name by channel, fallback to "Sensor {channel}" if not found
          const sensor = sensors.find(sens => sens.channel === s.channel);
          const sensorName = sensor ? sensor.name : `Sensor ${s.channel}`;
          return `${sensorName} ${s.operator} ${s.value}%`;
        });
        const logic = sensorCondition.logic || 'AND';
        conditions.push({
          label: 'Soil Moisture',
          value: sensorStrings.join(` ${logic} `),
        });
      } else {
        // Old format
        const oldCondition = rule.conditions.soilMoisture as { operator: string; value: number };
        conditions.push({
          label: 'Soil Moisture',
          value: `${oldCondition.operator} ${oldCondition.value}%`,
        });
      }
    }
    if (rule.conditions.rain1h) {
      conditions.push({
        label: 'Rain 1h',
        value: `${rule.conditions.rain1h.operator} ${rule.conditions.rain1h.value}"`,
      });
    }
    if (rule.conditions.temperature) {
      const tempCond = rule.conditions.temperature;
      if (tempCond.operator === 'trend') {
        conditions.push({
          label: 'Temperature',
          value: `Trend: ${tempCond.trend === 'increasing' ? 'Increasing' : 'Decreasing'} (7 days)`,
        });
      } else {
        conditions.push({
          label: 'Temperature',
          value: `${tempCond.operator} ${tempCond.value}°F`,
        });
      }
    }
    if (rule.conditions.humidity) {
      const humCond = rule.conditions.humidity;
      if (humCond.operator === 'trend') {
        conditions.push({
          label: 'Humidity',
          value: `Trend: ${humCond.trend === 'increasing' ? 'Increasing' : 'Decreasing'} (7 days)`,
        });
      } else {
        conditions.push({
          label: 'Humidity',
          value: `${humCond.operator} ${humCond.value}%`,
        });
      }
    }
    if (rule.conditions.pressure) {
      const pressCond = rule.conditions.pressure;
      if (pressCond.operator === 'trend') {
        conditions.push({
          label: 'Pressure',
          value: `Trend: ${pressCond.trend === 'increasing' ? 'Increasing' : 'Decreasing'} (7 days)`,
        });
      } else {
        conditions.push({
          label: 'Pressure',
          value: `${pressCond.operator} ${pressCond.value} inHg`,
        });
      }
    }
    return conditions;
  };

  const conditions = formatConditions();
  const action = actionDisplay || { icon: '', label: 'Loading...', value: '' };

  return (
    <div className={`p-6 ${isRachioSchedule ? 'bg-gradient-to-r from-indigo-50/50 to-purple-50/50 border-l-4 border-indigo-400' : ''}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="mb-3">
            {isRachioSchedule && rule.deviceName && (
              <div className="mb-2">
                <span className="inline-flex items-center px-3 py-1.5 rounded text-sm font-semibold bg-slate-100 text-slate-900 border border-slate-300">
                  <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  {rule.deviceName}
                </span>
              </div>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-2xl font-bold text-slate-900">{rule.name}</h3>
              {isRachioSchedule && 'color' in rule && rule.color && (
                <span
                  className="inline-block w-6 h-6 rounded border-2 border-slate-300"
                  style={{ backgroundColor: rule.color }}
                  title={`Schedule color: ${rule.color}`}
                />
              )}
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  rule.enabled
                    ? 'bg-green-100 text-green-800 border border-green-300'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                {rule.enabled ? (
                  <>
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                    Enabled
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 bg-slate-400 rounded-full mr-2"></span>
                    Disabled
                  </>
                )}
              </span>
              {!isRachioSchedule && rule.actions.type === 'set_rain_delay' && isInEffect === true && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
                  <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                  In Effect
                </span>
              )}
            </div>
          </div>

          {/* Rachio Schedule Display */}
          {isRachioSchedule && rachioScheduleDisplay && (
            <div className="mb-4">
              <div className="mb-3">
                <span className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Schedule Zones</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-3">
                {rachioScheduleDisplay.zones.map((zone, idx) => (
                  <div
                    key={zone.zoneId || idx}
                    className="flex flex-col items-center bg-white rounded-lg border border-slate-200 overflow-hidden hover:shadow-md transition-shadow duration-200"
                  >
                    {/* Zone Image */}
                    <div className="w-full aspect-square bg-slate-100 overflow-hidden relative">
                      {zone.imageUrl && !failedImages.has(zone.zoneId) ? (
                        <img
                          src={zone.imageUrl}
                          alt={zone.name}
                          className="w-full h-full object-cover"
                          onError={() => {
                            setFailedImages(prev => new Set(prev).add(zone.zoneId));
                          }}
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                          <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                          </svg>
                        </div>
                      )}
                      {/* Duration Badge Overlay */}
                      <div className="absolute top-2 right-2 bg-blue-600 text-white text-xs font-semibold px-2 py-1 rounded shadow-lg">
                        {zone.duration} min
                      </div>
                    </div>
                    {/* Zone Label */}
                    <div className="w-full p-2 text-center">
                      <div className="text-xs font-semibold text-slate-900 leading-tight">
                        {zone.deviceName} - {zone.name}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {rachioScheduleDisplay.zones.length > 1 && (
                <div className="mt-2 text-sm text-slate-600">
                  <span className="font-medium">Total Duration: </span>
                  <span className="font-semibold">{rachioScheduleDisplay.totalDuration} minutes</span>
                </div>
              )}
            </div>
          )}

          {/* Expandable Rachio Schedule Details */}
          {isRachioSchedule && isExpanded && (
            <div className="mt-4 pt-4 border-t border-indigo-200">
              <div className="space-y-4">
                {/* Summary (if available - shows formatted schedule description) */}
                {isRachioSchedule && 'summary' in rule && rule.summary && (
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-indigo-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Schedule Summary</div>
                      <div className="text-sm font-medium text-slate-900">{rule.summary}</div>
                    </div>
                  </div>
                )}

                {/* Watering Interval */}
                {isRachioSchedule && (('interval' in rule && rule.interval !== undefined) || ('scheduleJobTypes' in rule && rule.scheduleJobTypes)) && (
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-indigo-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Watering Interval</div>
                      <div className="text-sm font-medium text-slate-900">
                        {formatInterval(
                          'interval' in rule ? rule.interval : undefined,
                          'scheduleJobTypes' in rule ? rule.scheduleJobTypes : undefined,
                          'summary' in rule ? rule.summary : undefined
                        )}
                      </div>
                      {'scheduleJobTypes' in rule && rule.scheduleJobTypes && rule.scheduleJobTypes.length > 0 && (
                        <div className="text-xs text-slate-500 mt-1">Type: {rule.scheduleJobTypes.join(', ')}</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Start Time */}
                {isRachioSchedule && (
                  (('startTime' in rule && rule.startTime !== undefined) || 
                   ('startHour' in rule && rule.startHour !== undefined)) && (
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-indigo-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Start Time</div>
                        <div className="text-sm font-medium text-slate-900">
                          {formatStartTime(
                            'startTime' in rule ? rule.startTime : undefined,
                            'startHour' in rule ? rule.startHour : undefined,
                            'startMinute' in rule ? rule.startMinute : undefined,
                            'operator' in rule ? rule.operator : undefined
                          )}
                        </div>
                      </div>
                    </div>
                  )
                )}

                {/* Date Range */}
                {isRachioSchedule && (
                  (() => {
                    const rachioRule = rule as AutomationRule & { 
                      startDate?: number; 
                      endDate?: number | null;
                      startDay?: number;
                      startMonth?: number;
                      startYear?: number;
                      scheduleJobTypes?: string[];
                    };
                    if (rachioRule.startDate !== undefined || 
                        rachioRule.endDate !== null ||
                        (rachioRule.startDay !== undefined && rachioRule.startMonth !== undefined && rachioRule.startYear !== undefined)) {
                      const dateRange = formatDateRange(
                        rachioRule.startDate,
                        rachioRule.endDate,
                        rachioRule.startDay,
                        rachioRule.startMonth,
                        rachioRule.startYear,
                        rachioRule.scheduleJobTypes
                      );
                      return (
                        <div className="flex items-start gap-3">
                          <svg className="w-5 h-5 text-indigo-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <div className="flex-1">
                            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Start/End Dates</div>
                            <div className="text-sm font-medium text-slate-900">{dateRange.range}</div>
                            {dateRange.repeat && (
                              <div className="text-xs text-slate-500 mt-1">{dateRange.repeat}</div>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()
                )}

                {/* Cycle and Soak */}
                {isRachioSchedule && (
                  (('cycleSoak' in rule && rule.cycleSoak !== undefined) || 
                   ('cycleSoakStatus' in rule && rule.cycleSoakStatus)) && (
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-indigo-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Cycle and Soak</div>
                        <div className="space-y-1">
                          {'cycleSoakStatus' in rule && rule.cycleSoakStatus && (
                            <div className="text-sm font-medium text-slate-900">
                              Status: <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                rule.cycleSoakStatus === 'ON'
                                  ? 'bg-green-100 text-green-800 border border-green-200'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}>
                                {rule.cycleSoakStatus}
                              </span>
                            </div>
                          )}
                          {'cycleSoak' in rule && rule.cycleSoak !== undefined && (
                            <div className="text-xs text-slate-500">Enabled: {rule.cycleSoak ? 'Yes' : 'No'}</div>
                          )}
                          {'cycles' in rule && rule.cycles !== undefined && (
                            <div className="text-xs text-slate-500">Cycles: {rule.cycles}</div>
                          )}
                          {'totalDurationNoCycle' in rule && rule.totalDurationNoCycle !== undefined && (
                            <div className="text-xs text-slate-500">
                              Duration without cycle: {Math.round(rule.totalDurationNoCycle / 60)} minutes
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                )}

                {/* Rain Delay and Water Budget */}
                {isRachioSchedule && (
                  (('rainDelay' in rule && rule.rainDelay !== undefined) || 
                   ('waterBudget' in rule && rule.waterBudget !== undefined)) && (
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-indigo-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                      </svg>
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Weather Settings</div>
                        <div className="space-y-1.5">
                          {'rainDelay' in rule && rule.rainDelay !== undefined && (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-slate-700 w-32">Rain Delay:</span>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                rule.rainDelay
                                  ? 'bg-green-100 text-green-800 border border-green-200'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}>
                                {rule.rainDelay ? 'On' : 'Off'}
                              </span>
                            </div>
                          )}
                          {'waterBudget' in rule && rule.waterBudget !== undefined && (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-slate-700 w-32">Water Budget:</span>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                rule.waterBudget
                                  ? 'bg-green-100 text-green-800 border border-green-200'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}>
                                {rule.waterBudget ? 'On' : 'Off'}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                )}

                {/* Weather Intelligence */}
                {isRachioSchedule && 'weatherIntelligence' in rule && rule.weatherIntelligence && (
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-indigo-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                    </svg>
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Weather Intelligence</div>
                      <div className="space-y-1.5">
                        {'weatherIntelligenceSensitivity' in rule && rule.weatherIntelligenceSensitivity !== undefined && (
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm text-slate-700 w-40">Sensitivity:</span>
                            <span className="text-sm font-medium text-slate-900">{(rule.weatherIntelligenceSensitivity * 100).toFixed(0)}%</span>
                          </div>
                        )}
                        {rule.weatherIntelligence.rainSkip !== undefined && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-700 w-32">Rain Skip:</span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              rule.weatherIntelligence.rainSkip
                                ? 'bg-green-100 text-green-800 border border-green-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}>
                              {rule.weatherIntelligence.rainSkip ? 'On' : 'Off'}
                            </span>
                          </div>
                        )}
                        {rule.weatherIntelligence.freezeSkip !== undefined && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-700 w-32">Freeze Skip:</span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              rule.weatherIntelligence.freezeSkip
                                ? 'bg-green-100 text-green-800 border border-green-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}>
                              {rule.weatherIntelligence.freezeSkip ? 'On' : 'Off'}
                            </span>
                          </div>
                        )}
                        {rule.weatherIntelligence.windSkip !== undefined && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-700 w-32">Wind Skip:</span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              rule.weatherIntelligence.windSkip
                                ? 'bg-green-100 text-green-800 border border-green-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}>
                              {rule.weatherIntelligence.windSkip ? 'On' : 'Off'}
                            </span>
                          </div>
                        )}
                        {rule.weatherIntelligence.saturationSkip !== undefined && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-700 w-32">Saturation Skip:</span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              rule.weatherIntelligence.saturationSkip
                                ? 'bg-green-100 text-green-800 border border-green-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}>
                              {rule.weatherIntelligence.saturationSkip ? 'On' : 'Off'}
                            </span>
                          </div>
                        )}
                        {rule.weatherIntelligence.seasonalShift !== undefined && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-700 w-32">Seasonal Shift:</span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              rule.weatherIntelligence.seasonalShift
                                ? 'bg-green-100 text-green-800 border border-green-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}>
                              {rule.weatherIntelligence.seasonalShift ? 'On' : 'Off'}
                            </span>
                          </div>
                        )}
                        {rule.weatherIntelligence.etSkip !== undefined && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-700 w-32">ET Skip:</span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              rule.weatherIntelligence.etSkip
                                ? 'bg-green-100 text-green-800 border border-green-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}>
                              {rule.weatherIntelligence.etSkip ? 'On' : 'Off'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Seasonal Adjustment */}
                {isRachioSchedule && 'seasonalAdjustment' in rule && rule.seasonalAdjustment !== undefined && (
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-indigo-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Seasonal Adjustment</div>
                      <div className="text-sm font-medium text-slate-900">
                        {rule.seasonalAdjustment > 0 ? '+' : ''}{rule.seasonalAdjustment}%
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Conditions (only for custom rules) */}
          {!isRachioSchedule && (
            <div className="mb-4">
              <div className="mb-2">
                <span className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Conditions</span>
              </div>
              {conditions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {conditions.map((cond, idx) => (
                    <div
                      key={idx}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                    >
                      <span className="font-medium text-slate-700">{cond.label}:</span>
                      <span className="font-semibold text-slate-900">{cond.value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic">No conditions set</p>
              )}
            </div>
          )}

          {/* Actions (only for custom rules) */}
          {!isRachioSchedule && (
            <div className="mb-4">
              <div className="mb-2">
                <span className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Action</span>
              </div>
              {customRuleZonesDisplay && rule.actions.type === 'run_zone' ? (
                <div>
                  <div className="mb-2 text-sm text-slate-600">
                    <span className="font-medium">{action.label}:</span>
                    <span className="font-semibold ml-2">{customRuleZonesDisplay.duration} minutes</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {customRuleZonesDisplay.zones.map((zone, idx) => (
                      <div
                        key={zone.zoneId || idx}
                        className="flex flex-col items-center bg-white rounded-lg border border-slate-200 overflow-hidden hover:shadow-md transition-shadow duration-200"
                      >
                        {/* Zone Image */}
                        <div className="w-full aspect-square bg-slate-100 overflow-hidden relative">
                          {zone.imageUrl && !failedImages.has(zone.zoneId) ? (
                            <img
                              src={zone.imageUrl}
                              alt={zone.name}
                              className="w-full h-full object-cover"
                              onError={() => {
                                setFailedImages(prev => new Set(prev).add(zone.zoneId));
                              }}
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                              </svg>
                            </div>
                          )}
                          {/* Duration Badge Overlay */}
                          <div className="absolute top-2 right-2 bg-blue-600 text-white text-xs font-semibold px-2 py-1 rounded shadow-lg">
                            {customRuleZonesDisplay.duration} min
                          </div>
                        </div>
                        {/* Zone Label */}
                        <div className="w-full p-2 text-center">
                          <div className="text-xs font-semibold text-slate-900 leading-tight">
                            {zone.deviceName} - {zone.name}
                          </div>
                          {zone.cooldownPeriodDays !== null && zone.cooldownPeriodDays !== undefined && (
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              Cooldown: {zone.cooldownPeriodDays} day{zone.cooldownPeriodDays !== 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="font-medium text-slate-700">{action.label}:</span>
                  <span className="font-semibold text-slate-900">{action.value}</span>
                </div>
              )}
            </div>
          )}

          {/* Last Run (only for custom rules) */}
          {!isRachioSchedule && rule.lastRunAt && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Last run: {new Date(rule.lastRunAt).toLocaleString()}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-wrap justify-end">
          {isRachioSchedule && (
            <>
              <button
                onClick={async () => {
                  if (!onStartSchedule || isStartingSchedule) return;
                  setIsStartingSchedule(true);
                  try {
                    await onStartSchedule(rule.id);
                  } catch (err) {
                    // Error is handled by parent component
                  } finally {
                    setIsStartingSchedule(false);
                  }
                }}
                disabled={isStartingSchedule || !onStartSchedule}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Start this schedule immediately"
              >
                {isStartingSchedule ? (
                  <>
                    <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Starting...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Start
                  </>
                )}
              </button>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                  isExpanded
                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-300 hover:bg-indigo-200'
                    : 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100'
                }`}
                aria-expanded={isExpanded}
              >
                <svg
                  className={`w-4 h-4 mr-2 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                Details
              </button>
            </>
          )}
          {!isRachioSchedule && (
            <button
              onClick={() => onToggle(rule.id, !rule.enabled, rule.source)}
              className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                rule.enabled
                  ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                  : 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
              }`}
            >
              {rule.enabled ? (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  Disable
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Enable
                </>
              )}
            </button>
          )}
          {!isRachioSchedule && (
            <>
              <button
                onClick={onEdit}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-all duration-200"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
              <button
                onClick={() => onDuplicate(rule)}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-all duration-200"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Duplicate
              </button>
              <button
                onClick={() => onDelete(rule.id, rule.source)}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-all duration-200"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
