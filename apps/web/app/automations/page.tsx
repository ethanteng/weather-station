'use client';

import { useEffect, useState } from 'react';
import { automationApi, AutomationRule, rachioApi, RachioZone } from '../../lib/api';
import Link from 'next/link';

export default function AutomationsPage() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string>('');

  useEffect(() => {
    const token = localStorage.getItem('authToken') || prompt('Enter admin password:');
    if (token) {
      localStorage.setItem('authToken', token);
      setAuthToken(token);
    }
  }, []);

  useEffect(() => {
    if (authToken) {
      fetchRules();
    }
  }, [authToken]);

  const fetchRules = async () => {
    if (!authToken) return;

    try {
      setError(null);
      const { setAuthToken: setApiAuth } = await import('../../lib/api');
      setApiAuth(authToken);

      const data = await automationApi.getRules();
      setRules(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (id: string, enabled: boolean, source?: 'custom' | 'rachio') => {
    try {
      // Check if this is a Rachio schedule
      if (source === 'rachio') {
        // Extract the actual Rachio schedule ID (remove 'rachio_' prefix)
        const rachioScheduleId = id.replace(/^rachio_/, '');
        if (enabled) {
          await rachioApi.enableSchedule(rachioScheduleId);
        } else {
          await rachioApi.disableSchedule(rachioScheduleId);
        }
      } else {
        // Custom rule
        if (enabled) {
          await automationApi.enableRule(id);
        } else {
          await automationApi.disableRule(id);
        }
      }
      await fetchRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update rule');
    }
  };

  const handleDelete = async (id: string, source?: 'custom' | 'rachio') => {
    // Prevent deletion of Rachio schedules
    if (source === 'rachio') {
      alert('Rachio schedules can only be deleted through the Rachio app.');
      return;
    }

    if (!confirm('Are you sure you want to delete this rule?')) return;

    try {
      await automationApi.deleteRule(id);
      await fetchRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete rule');
    }
  };

  const handleSave = async (rule: AutomationRule) => {
    try {
      await automationApi.updateRule(rule.id, rule);
      setEditingId(null);
      await fetchRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rule');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-slate-600">Loading automation rules...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold text-slate-900 mb-2">Automation Rules</h1>
              <p className="text-slate-600 text-lg">Configure intelligent irrigation automation based on weather conditions</p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/"
                className="inline-flex items-center px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg shadow-sm hover:bg-slate-50 hover:border-slate-400 transition-all duration-200"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Dashboard
              </Link>
              <button
                onClick={() => setEditingId('new')}
                className="inline-flex items-center px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow-md hover:from-blue-700 hover:to-blue-800 transition-all duration-200 transform hover:scale-105"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Rule
              </button>
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg shadow-sm">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p className="text-red-800 font-medium">{error}</p>
            </div>
          </div>
        )}

        {/* New Rule Editor */}
        {editingId === 'new' && (
          <div className="mb-6 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
              <h2 className="text-xl font-semibold text-white">Create New Automation Rule</h2>
            </div>
            <div className="p-6">
              <RuleEditor
                rule={null}
                onSave={(rule) => {
                  automationApi.createRule(rule).then(() => {
                    setEditingId(null);
                    fetchRules();
                  }).catch((err) => {
                    setError(err instanceof Error ? err.message : 'Failed to create rule');
                  });
                }}
                onCancel={() => setEditingId(null)}
              />
            </div>
          </div>
        )}

        {/* Rules List */}
        <div className="space-y-4">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`bg-white rounded-xl shadow-md border transition-all duration-200 hover:shadow-lg ${
                rule.enabled ? 'border-green-200' : 'border-slate-200 opacity-75'
              }`}
            >
              {editingId === rule.id ? (
                <div className="p-6">
                  <div className="mb-4 pb-4 border-b border-slate-200">
                    <h3 className="text-lg font-semibold text-slate-900">Editing Rule</h3>
                  </div>
                  <RuleEditor
                    rule={rule}
                    onSave={handleSave}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              ) : (
                <RuleView
                  rule={rule}
                  onEdit={() => {
                    // Only allow editing custom rules
                    if (rule.source !== 'rachio') {
                      setEditingId(rule.id);
                    }
                  }}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              )}
            </div>
          ))}
        </div>

        {/* Empty State */}
        {rules.length === 0 && !editingId && (
          <div className="text-center py-16 bg-white rounded-xl shadow-md border border-slate-200">
            <svg className="w-16 h-16 mx-auto text-slate-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <h3 className="text-xl font-semibold text-slate-900 mb-2">No Automation Rules</h3>
            <p className="text-slate-600 mb-6 max-w-md mx-auto">
              Create your first automation rule to automatically control irrigation based on weather conditions.
            </p>
            <button
              onClick={() => setEditingId('new')}
              className="inline-flex items-center px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow-md hover:from-blue-700 hover:to-blue-800 transition-all duration-200"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Your First Rule
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RuleView({
  rule,
  onEdit,
  onToggle,
  onDelete,
}: {
  rule: AutomationRule;
  onEdit: () => void;
  onToggle: (id: string, enabled: boolean, source?: 'custom' | 'rachio') => void;
  onDelete: (id: string, source?: 'custom' | 'rachio') => void;
}) {
  const [actionDisplay, setActionDisplay] = useState<{ icon: string; label: string; value: string } | null>(null);
  const [rachioScheduleDisplay, setRachioScheduleDisplay] = useState<{ zones: Array<{ name: string; duration: number; deviceName: string }>; totalDuration: number } | null>(null);
  const isRachioSchedule = rule.source === 'rachio';

  useEffect(() => {
    const loadActionDisplay = async () => {
      // Handle Rachio schedules differently
      if (isRachioSchedule && rule.scheduleZones) {
        try {
          // Fetch zone names with device names
          const devices = await rachioApi.getDevices();
          const zoneDeviceMap = new Map<string, string>(); // zoneId -> deviceName
          const zoneNameMap = new Map<string, string>(); // zoneId -> zoneName
          const allZones: RachioZone[] = [];
          
          // Build device and zone maps
          for (const device of devices) {
            if (device.zones) {
              allZones.push(...device.zones);
              device.zones.forEach(zone => {
                zoneDeviceMap.set(zone.id, device.name);
                zoneNameMap.set(zone.id, zone.name);
              });
            }
          }
          
          // Format schedule zones with names and durations
          const formattedZones = rule.scheduleZones.map(sz => ({
            name: zoneNameMap.get(sz.zoneId) || `Zone ${sz.zoneId.substring(0, 8)}`,
            duration: Math.round(sz.duration / 60), // Convert seconds to minutes
            deviceName: zoneDeviceMap.get(sz.zoneId) || rule.deviceName || 'Unknown Device',
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
        setActionDisplay({
          icon: '⏸️',
          label: 'Set Rain Delay',
          value: `${rule.actions.hours} hours`,
        });
        return;
      }
      if (rule.actions.type === 'run_zone') {
        let zoneDisplay = '';
        if (rule.actions.zoneIds && rule.actions.zoneIds.length > 0) {
          try {
            // Fetch zone names with device names
            const devices = await rachioApi.getDevices();
            const zoneDeviceMap = new Map<string, string>(); // zoneId -> deviceName
            const allZones: RachioZone[] = [];
            
            // Build device map and collect zones
            for (const device of devices) {
              if (device.zones) {
                allZones.push(...device.zones);
                device.zones.forEach(zone => {
                  zoneDeviceMap.set(zone.id, device.name);
                });
              }
            }
            
            const selectedZones = allZones.filter(zone => rule.actions.zoneIds?.includes(zone.id));
            if (selectedZones.length > 0) {
              // Format as "Device Name - Zone Name"
              const zoneStrings = selectedZones.map(z => {
                const deviceName = zoneDeviceMap.get(z.id) || 'Unknown Device';
                return `${deviceName} - ${z.name}`;
              });
              zoneDisplay = zoneStrings.join(', ');
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
          icon: '🚿',
          label: 'Run Zone(s)',
          value: `${rule.actions.minutes} minutes${zoneDisplay ? ` - ${zoneDisplay}` : ''}`,
        });
        return;
      }
      setActionDisplay({ icon: '❓', label: 'Unknown', value: '' });
    };

    loadActionDisplay();
  }, [rule.actions, rule.source, rule.scheduleZones, rule.deviceName, isRachioSchedule]);

  const formatConditions = () => {
    const conditions: Array<{ label: string; value: string; icon: string }> = [];
    if (rule.conditions.rain24h) {
      conditions.push({
        label: 'Rain 24h',
        value: `${rule.conditions.rain24h.operator} ${rule.conditions.rain24h.value}"`,
        icon: '🌧️',
      });
    }
    if (rule.conditions.soilMoisture) {
      conditions.push({
        label: 'Soil Moisture',
        value: `${rule.conditions.soilMoisture.operator} ${rule.conditions.soilMoisture.value}%`,
        icon: '🌱',
      });
    }
    if (rule.conditions.rain1h) {
      conditions.push({
        label: 'Rain 1h',
        value: `${rule.conditions.rain1h.operator} ${rule.conditions.rain1h.value}"`,
        icon: '💧',
      });
    }
    if (rule.conditions.temperature) {
      conditions.push({
        label: 'Temperature',
        value: `${rule.conditions.temperature.operator} ${rule.conditions.temperature.value}°F`,
        icon: '🌡️',
      });
    }
    if (rule.conditions.humidity) {
      conditions.push({
        label: 'Humidity',
        value: `${rule.conditions.humidity.operator} ${rule.conditions.humidity.value}%`,
        icon: '💨',
      });
    }
    return conditions;
  };

  const conditions = formatConditions();
  const action = actionDisplay || { icon: '❓', label: 'Loading...', value: '' };

  return (
    <div className={`p-6 ${isRachioSchedule ? 'bg-gradient-to-r from-indigo-50/50 to-purple-50/50 border-l-4 border-indigo-400' : ''}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <h3 className="text-2xl font-bold text-slate-900">{rule.name}</h3>
            {isRachioSchedule && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
                📅 Rachio Schedule
              </span>
            )}
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                rule.enabled
                  ? 'bg-green-100 text-green-800 border border-green-200'
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
            {isRachioSchedule && rule.deviceName && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                🏠 {rule.deviceName}
              </span>
            )}
          </div>

          {/* Rachio Schedule Display */}
          {isRachioSchedule && rachioScheduleDisplay && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Schedule Zones</span>
              </div>
              <div className="space-y-2">
                {rachioScheduleDisplay.zones.map((zone, idx) => (
                  <div key={idx} className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-lg text-sm mr-2 mb-2">
                    <span className="text-lg">🚿</span>
                    <span className="font-medium text-slate-700">{zone.deviceName} - {zone.name}:</span>
                    <span className="font-semibold text-purple-700">{zone.duration} min</span>
                  </div>
                ))}
                {rachioScheduleDisplay.zones.length > 1 && (
                  <div className="mt-2 text-sm text-slate-600">
                    <span className="font-medium">Total Duration: </span>
                    <span className="font-semibold">{rachioScheduleDisplay.totalDuration} minutes</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Conditions (only for custom rules) */}
          {!isRachioSchedule && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Conditions</span>
              </div>
              {conditions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {conditions.map((cond, idx) => (
                    <div
                      key={idx}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-sm"
                    >
                      <span>{cond.icon}</span>
                      <span className="font-medium text-slate-700">{cond.label}:</span>
                      <span className="font-semibold text-blue-700">{cond.value}</span>
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
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Action</span>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-lg">
                <span className="text-lg">{action.icon}</span>
                <span className="font-medium text-slate-700">{action.label}:</span>
                <span className="font-semibold text-purple-700">{action.value}</span>
              </div>
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
        <div className="flex gap-2">
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

function RuleEditor({
  rule,
  onSave,
  onCancel,
}: {
  rule: AutomationRule | null;
  onSave: (rule: AutomationRule) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(rule?.name || '');
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [conditions, setConditions] = useState(rule?.conditions || {});
  const [actions, setActions] = useState(rule?.actions || { type: 'set_rain_delay' as const });
  const [zones, setZones] = useState<RachioZone[]>([]);
  const [zoneDeviceMap, setZoneDeviceMap] = useState<Map<string, string>>(new Map()); // zoneId -> deviceName
  const [loadingZones, setLoadingZones] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Rule name is required');
      return;
    }

    // Validate run_zone action has zones selected
    if (actions.type === 'run_zone' && (!actions.zoneIds || actions.zoneIds.length === 0)) {
      alert('Please select at least one zone for the run zone action');
      return;
    }

    const ruleData: AutomationRule = {
      id: rule?.id || '',
      name,
      enabled,
      conditions,
      actions,
      createdAt: rule?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(ruleData);
  };

  const updateCondition = (field: string, operator: string, value: string) => {
    setConditions({
      ...conditions,
      [field]: value ? { operator: operator as any, value: parseFloat(value) } : undefined,
    });
  };

  const removeCondition = (field: string) => {
    const newConditions = { ...conditions };
    delete newConditions[field as keyof typeof conditions];
    setConditions(newConditions);
  };

  // Fetch zones when run_zone action is selected
  useEffect(() => {
    const fetchZones = async () => {
      if (actions.type === 'run_zone') {
        setLoadingZones(true);
        try {
          const devices = await rachioApi.getDevices();
          const allZones: RachioZone[] = [];
          const deviceMap = new Map<string, string>(); // zoneId -> deviceName
          
          // Get all zones from all devices and map them to device names
          for (const device of devices) {
            if (device.zones && device.zones.length > 0) {
              const enabledZones = device.zones.filter(zone => zone.enabled);
              allZones.push(...enabledZones);
              // Map each zone to its device name
              enabledZones.forEach(zone => {
                deviceMap.set(zone.id, device.name);
              });
            }
          }
          
          setZones(allZones);
          setZoneDeviceMap(deviceMap);
        } catch (error) {
          console.error('Error fetching zones:', error);
          setZones([]);
          setZoneDeviceMap(new Map());
        } finally {
          setLoadingZones(false);
        }
      }
    };

    fetchZones();
  }, [actions.type]);

  const conditionFields = [
    { key: 'rain24h' as const, label: 'Rain 24h', icon: '🌧️', unit: '"' },
    { key: 'soilMoisture' as const, label: 'Soil Moisture', icon: '🌱', unit: '%' },
    { key: 'rain1h' as const, label: 'Rain 1h', icon: '💧', unit: '"' },
    { key: 'temperature' as const, label: 'Temperature', icon: '🌡️', unit: '°F' },
    { key: 'humidity' as const, label: 'Humidity', icon: '💨', unit: '%' },
  ];

  const handleZoneToggle = (zoneId: string) => {
    const currentZoneIds = actions.zoneIds || [];
    const newZoneIds = currentZoneIds.includes(zoneId)
      ? currentZoneIds.filter(id => id !== zoneId)
      : [...currentZoneIds, zoneId];
    
    setActions({ ...actions, zoneIds: newZoneIds });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Rule Name */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          Rule Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
          placeholder="e.g., Rainy Day Pause"
          required
        />
      </div>

      {/* Enabled Toggle */}
      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
        <div>
          <label className="text-sm font-semibold text-slate-700">Rule Status</label>
          <p className="text-xs text-slate-500 mt-0.5">Enable or disable this automation rule</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          <span className="ml-3 text-sm font-medium text-slate-700">{enabled ? 'Enabled' : 'Disabled'}</span>
        </label>
      </div>

      {/* Conditions */}
      <div className="bg-slate-50 rounded-lg border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <label className="text-sm font-semibold text-slate-700">Conditions</label>
          <span className="text-xs text-slate-500 ml-2">(All conditions must be met)</span>
        </div>
        <div className="space-y-3">
          {conditionFields.map((field) => {
            const condition = conditions[field.key];
            return (
              <div key={field.key} className="flex items-center gap-3 bg-white p-3 rounded-lg border border-slate-200">
                <span className="text-xl w-8 text-center">{field.icon}</span>
                <span className="w-32 text-sm font-medium text-slate-700">{field.label}:</span>
                <select
                  value={condition?.operator || ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      updateCondition(field.key, e.target.value, condition?.value?.toString() || '');
                    } else {
                      removeCondition(field.key);
                    }
                  }}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                >
                  <option value="">Not used</option>
                  <option value=">=">≥ (Greater than or equal)</option>
                  <option value="<=">≤ (Less than or equal)</option>
                  <option value=">">&gt; (Greater than)</option>
                  <option value="<">&lt; (Less than)</option>
                  <option value="==">= (Equal to)</option>
                </select>
                {condition && (
                  <>
                    <input
                      type="number"
                      step="0.1"
                      value={condition.value || ''}
                      onChange={(e) => updateCondition(field.key, condition.operator, e.target.value)}
                      className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      required
                      placeholder="0"
                    />
                    <span className="text-sm text-slate-600 font-medium w-8">{field.unit}</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="bg-slate-50 rounded-lg border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <label className="text-sm font-semibold text-slate-700">Action</label>
        </div>
        <div className="space-y-4">
          <select
            value={actions.type}
            onChange={(e) => {
              const newType = e.target.value as 'set_rain_delay' | 'run_zone';
              setActions({ 
                type: newType, 
                hours: undefined, 
                minutes: undefined,
                zoneIds: newType === 'run_zone' ? (actions.zoneIds || []) : undefined
              });
            }}
            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
          >
            <option value="set_rain_delay">⏸️ Set Rain Delay</option>
            <option value="run_zone">🚿 Run Zone(s)</option>
          </select>
          {actions.type === 'set_rain_delay' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Duration (Hours)</label>
              <input
                type="number"
                min="1"
                value={actions.hours || ''}
                onChange={(e) => setActions({ ...actions, hours: parseInt(e.target.value) })}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                required
                placeholder="48"
              />
            </div>
          )}
          {actions.type === 'run_zone' && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Select Zone(s) <span className="text-red-500">*</span>
                </label>
                {loadingZones ? (
                  <div className="text-sm text-slate-500 py-2">Loading zones...</div>
                ) : zones.length === 0 ? (
                  <div className="text-sm text-amber-600 py-2 bg-amber-50 border border-amber-200 rounded-lg px-3">
                    No enabled zones found. Make sure zones are enabled in your Rachio device.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {zones.map((zone) => {
                      const isSelected = (actions.zoneIds || []).includes(zone.id);
                      const deviceName = zoneDeviceMap.get(zone.id) || 'Unknown Device';
                      return (
                        <div
                          key={zone.id}
                          onClick={() => handleZoneToggle(zone.id)}
                          className={`relative bg-white rounded-lg border-2 overflow-hidden cursor-pointer transition-all hover:shadow-md ${
                            isSelected
                              ? 'border-blue-500 shadow-md ring-2 ring-blue-200'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {/* Selection Indicator */}
                          {isSelected && (
                            <div className="absolute top-2 right-2 z-10">
                              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center shadow-lg">
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            </div>
                          )}
                          
                          {/* Zone Image */}
                          {zone.imageUrl ? (
                            <div className="aspect-square bg-slate-100 overflow-hidden">
                              <img
                                src={zone.imageUrl}
                                alt={zone.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            </div>
                          ) : (
                            <div className="aspect-square bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                              <span className="text-4xl">🚿</span>
                            </div>
                          )}
                          
                          {/* Zone Info */}
                          <div className="p-2">
                            <div className="flex items-center gap-1.5 mb-1">
                              {zone.zoneNumber && (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
                                  {zone.zoneNumber}
                                </span>
                              )}
                              <span className="text-xs font-semibold text-slate-900 truncate flex-1">{zone.name}</span>
                            </div>
                            <div className="text-xs text-slate-500 truncate">{deviceName}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {(actions.zoneIds || []).length === 0 && !loadingZones && zones.length > 0 && (
                  <p className="text-xs text-amber-600 mt-2">Please select at least one zone</p>
                )}
                {(actions.zoneIds || []).length > 0 && (
                  <p className="text-xs text-slate-600 mt-2">
                    {(actions.zoneIds || []).length} zone{(actions.zoneIds || []).length !== 1 ? 's' : ''} selected
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Duration (Minutes) <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  min="1"
                  value={actions.minutes || ''}
                  onChange={(e) => setActions({ ...actions, minutes: parseInt(e.target.value) })}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  required
                  placeholder="10"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex gap-3 pt-4 border-t border-slate-200">
        <button
          type="submit"
          className="flex-1 inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow-md hover:from-blue-700 hover:to-blue-800 transition-all duration-200 transform hover:scale-105"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Save Rule
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-all duration-200"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
