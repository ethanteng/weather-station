'use client';

import { useEffect, useState } from 'react';
import { automationApi, AutomationRule, rachioApi, RachioDevice, RachioZone, sensorApi, SoilMoistureSensor, SoilMoistureCondition, SoilMoistureSensorCondition } from '../../lib/api';
import Link from 'next/link';
import { ConfirmModal } from '../../components/ConfirmModal';
import { Modal } from '../../components/Modal';
import { RuleView } from '../../components/AutomationRuleView';

export default function AutomationsPage() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string>('');
  const [rachioRateLimit, setRachioRateLimit] = useState<{
    rateLimitReset: string | null;
    message?: string;
  } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    message: '',
    onConfirm: () => {},
  });
  const [infoModal, setInfoModal] = useState<{
    isOpen: boolean;
    message: string;
    title?: string;
    type?: 'success' | 'error' | 'info';
  }>({
    isOpen: false,
    message: '',
    type: 'info',
  });
  const [runningAutomation, setRunningAutomation] = useState(false);

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

      const response = await automationApi.getRules();
      // Handle rate limit info if present
      if (response && typeof response === 'object' && 'rateLimitError' in response) {
        const rateLimitError = (response as any).rateLimitError;
        setRachioRateLimit({
          rateLimitReset: rateLimitError.rateLimitReset,
          message: rateLimitError.message,
        });
        // Set rules from response (might be empty array if rate limited)
        setRules((response as any).rules || []);
      } else {
        setRachioRateLimit(null);
        setRules(response as AutomationRule[]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (id: string, enabled: boolean, source?: 'custom' | 'rachio') => {
    try {
      // Only handle custom rules here - Rachio schedules use start/skip instead
      if (source !== 'rachio') {
        if (enabled) {
          await automationApi.enableRule(id);
        } else {
          await automationApi.disableRule(id);
        }
        await fetchRules();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update rule');
    }
  };

  const handleStartSchedule = async (id: string) => {
    try {
      const rachioScheduleId = id.replace(/^rachio_/, '');
      await rachioApi.startSchedule(rachioScheduleId);
      await fetchRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start schedule');
    }
  };

  const handleSkipSchedule = async (id: string) => {
    try {
      const rachioScheduleId = id.replace(/^rachio_/, '');
      await rachioApi.skipSchedule(rachioScheduleId);
      await fetchRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to skip schedule');
    }
  };

  const handleDelete = async (id: string, source?: 'custom' | 'rachio') => {
    // Prevent deletion of Rachio schedules
    if (source === 'rachio') {
      setInfoModal({
        isOpen: true,
        message: 'Rachio schedules can only be deleted through the Rachio app.',
        title: 'Cannot Delete',
        type: 'info',
      });
      return;
    }

    // Show confirmation modal
    setConfirmModal({
      isOpen: true,
      message: 'Are you sure you want to delete this rule? This action cannot be undone.',
      onConfirm: async () => {
        try {
          await automationApi.deleteRule(id);
          await fetchRules();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to delete rule');
        }
      },
    });
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

  const handleDuplicate = async (rule: AutomationRule) => {
    try {
      // Create a copy of the rule with a new name
      const duplicatedRule: Omit<AutomationRule, 'id' | 'createdAt' | 'updatedAt' | 'lastRunAt' | 'lastResult'> = {
        name: `Copy of ${rule.name}`,
        enabled: false, // Start disabled so user can review before enabling
        conditions: { ...rule.conditions },
        actions: { ...rule.actions },
      };

      const newRule = await automationApi.createRule(duplicatedRule);
      // Open the duplicated rule in edit mode
      setEditingId(newRule.id);
      await fetchRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate rule');
    }
  };

  const handleRunNow = async () => {
    try {
      setRunningAutomation(true);
      setError(null);
      await automationApi.run();
      // Refresh rules to show updated lastRunAt times
      await fetchRules();
      setInfoModal({
        isOpen: true,
        message: 'Automation evaluation completed. Check server logs for detailed debugging information.',
        title: 'Automation Complete',
        type: 'success',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run automation');
      setInfoModal({
        isOpen: true,
        message: err instanceof Error ? err.message : 'Failed to run automation',
        title: 'Error',
        type: 'error',
      });
    } finally {
      setRunningAutomation(false);
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
              <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">Automation Rules</h1>
              <p className="text-slate-600 text-base sm:text-lg">Configure intelligent irrigation automation based on weather conditions</p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/"
                className="inline-flex items-center px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg shadow-sm hover:bg-slate-50 hover:border-slate-400 transition-all duration-200 min-h-[44px]"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Dashboard
              </Link>
              <Link
                href="/sensors"
                className="inline-flex items-center px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg shadow-sm hover:bg-slate-50 hover:border-slate-400 transition-all duration-200 min-h-[44px]"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Sensors
              </Link>
              <Link
                href="/history"
                className="inline-flex items-center px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg shadow-sm hover:bg-slate-50 hover:border-slate-400 transition-all duration-200 min-h-[44px]"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                History
              </Link>
              <button
                onClick={handleRunNow}
                disabled={runningAutomation}
                className="inline-flex items-center px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-green-600 to-green-700 rounded-lg shadow-md hover:from-green-700 hover:to-green-800 transition-all duration-200 transform hover:scale-105 min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none whitespace-nowrap"
              >
                <svg className={`w-5 h-5 mr-2 ${runningAutomation ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {runningAutomation ? 'Running...' : 'Run automations now'}
              </button>
              <button
                onClick={() => setEditingId('new')}
                className="inline-flex items-center px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow-md hover:from-blue-700 hover:to-blue-800 transition-all duration-200 transform hover:scale-105 min-h-[44px] whitespace-nowrap"
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

        {/* Rachio Rate Limit Info */}
        {rachioRateLimit && (
          <div className="mb-6 p-4 bg-blue-50 border-l-4 border-blue-500 rounded-r-lg shadow-sm">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-blue-500 mr-3 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <p className="text-blue-800 font-medium mb-1">Rachio API Rate Limit Active</p>
                <p className="text-blue-700 text-sm">
                  {rachioRateLimit.rateLimitReset ? (
                    <>
                      Rachio schedules are temporarily unavailable. Rate limit will reset at{' '}
                      <span className="font-semibold">
                        {new Date(rachioRateLimit.rateLimitReset).toLocaleString()}
                      </span>
                      {' '}({(() => {
                        const resetTime = new Date(rachioRateLimit.rateLimitReset);
                        const now = new Date();
                        const msUntilReset = resetTime.getTime() - now.getTime();
                        const hoursUntilReset = Math.floor(msUntilReset / (1000 * 60 * 60));
                        const minutesUntilReset = Math.floor((msUntilReset % (1000 * 60 * 60)) / (1000 * 60));
                        if (hoursUntilReset > 0) {
                          return `${hoursUntilReset}h ${minutesUntilReset}m`;
                        }
                        return `${minutesUntilReset}m`;
                      })()} remaining)
                    </>
                  ) : (
                    rachioRateLimit.message || 'Rachio schedules are temporarily unavailable. Please wait before refreshing.'
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* New Rule Editor */}
        {editingId === 'new' && (
          <div className="mb-6 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="bg-slate-800 px-4 sm:px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg sm:text-xl font-semibold text-white">Create New Automation Rule</h2>
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
                onError={(message, title) => {
                  setInfoModal({
                    isOpen: true,
                    message,
                    title: title || 'Error',
                    type: 'error',
                  });
                }}
              />
            </div>
          </div>
        )}

        {/* Rules List */}
        <div className="space-y-8">
          {/* Custom Rules Section */}
          {rules.filter(r => r.source !== 'rachio').length > 0 && (
            <div>
              <div className="mb-4">
                <h2 className="text-2xl font-bold text-slate-900">Custom Automation Rules</h2>
                <p className="text-sm text-slate-600 mt-1">Rules configured in this app</p>
              </div>
              <div className="space-y-4">
                {rules
                  .filter(r => r.source !== 'rachio')
                  .map((rule) => (
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
                            onError={(message, title) => {
                              setInfoModal({
                                isOpen: true,
                                message,
                                title: title || 'Error',
                                type: 'error',
                              });
                            }}
                          />
                        </div>
                      ) : (
                        <RuleView
                          rule={rule}
                          onEdit={() => {
                            setEditingId(rule.id);
                          }}
                          onToggle={handleToggle}
                          onDelete={handleDelete}
                          onDuplicate={handleDuplicate}
                          onStartSchedule={handleStartSchedule}
                          onSkipSchedule={handleSkipSchedule}
                        />
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Empty State — custom rules only; Rachio schedules live on the dashboard */}
        {rules.filter((r) => r.source !== 'rachio').length === 0 && !editingId && (
          rules.length === 0 ? (
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
          ) : (
            <div className="text-center py-12 bg-white rounded-xl shadow-md border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No custom automation rules</h3>
              <p className="text-slate-600 mb-4 max-w-md mx-auto text-sm">
                Rachio watering schedules are shown on the{' '}
                <Link href="/" className="text-blue-600 hover:text-blue-700 font-medium underline">
                  home dashboard
                </Link>
                .
              </p>
              <button
                onClick={() => setEditingId('new')}
                className="inline-flex items-center px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow-md hover:from-blue-700 hover:to-blue-800 transition-all duration-200"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create a custom rule
              </button>
            </div>
          )
        )}
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={confirmModal.onConfirm}
        title="Delete Rule"
        message={confirmModal.message}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
      <Modal
        isOpen={infoModal.isOpen}
        onClose={() => setInfoModal({ ...infoModal, isOpen: false })}
        title={infoModal.title}
        message={infoModal.message}
        type={infoModal.type}
      />
    </div>
  );
}


function RuleEditor({
  rule,
  onSave,
  onCancel,
  onError,
}: {
  rule: AutomationRule | null;
  onSave: (rule: AutomationRule) => void;
  onCancel: () => void;
  onError?: (message: string, title?: string) => void;
}) {
  const [name, setName] = useState(rule?.name || '');
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [conditions, setConditions] = useState(rule?.conditions || {});
  const [actions, setActions] = useState(rule?.actions || { type: 'set_rain_delay' as const });
  const [zones, setZones] = useState<RachioZone[]>([]);
  const [zoneDeviceMap, setZoneDeviceMap] = useState<Map<string, string>>(new Map()); // zoneId -> deviceName
  const [loadingZones, setLoadingZones] = useState(false);
  const [devices, setDevices] = useState<RachioDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [sensors, setSensors] = useState<SoilMoistureSensor[]>([]);
  const [loadingSensors, setLoadingSensors] = useState(false);
  const [selectedSensors, setSelectedSensors] = useState<Array<{ channel: number; operator: string; value: string }>>([]);
  const [sensorLogic, setSensorLogic] = useState<'AND' | 'OR'>('AND');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      if (onError) {
        onError('Rule name is required', 'Validation Error');
      } else {
        alert('Rule name is required');
      }
      return;
    }

    // Validate run_zone action has zones selected
    if (actions.type === 'run_zone' && (!actions.zoneIds || actions.zoneIds.length === 0)) {
      if (onError) {
        onError('Please select at least one zone for the run zone action', 'Validation Error');
      } else {
        alert('Please select at least one zone for the run zone action');
      }
      return;
    }

    // Build final conditions with soil moisture condition
    const finalConditions = { ...conditions };
    
    // Always use multi-sensor format (supports single or multiple sensors)
    const validSensors = selectedSensors.filter(s => s.channel && s.operator && s.value);
    if (validSensors.length > 0) {
      finalConditions.soilMoisture = {
        sensors: validSensors.map(s => ({
          channel: s.channel,
          operator: s.operator as any,
          value: parseFloat(s.value),
        })),
        logic: sensorLogic,
      };
    } else {
      delete finalConditions.soilMoisture;
    }

    const ruleData: AutomationRule = {
      id: rule?.id || '',
      name,
      enabled,
      conditions: finalConditions,
      actions,
      createdAt: rule?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(ruleData);
  };

  const updateCondition = (field: string, operator: string, value: string, trend?: 'increasing' | 'decreasing') => {
    if (field === 'soilMoisture') {
      // Soil moisture is now handled via selectedSensors, skip legacy handling
      // This condition is kept for backward compatibility but shouldn't be called
    } else {
      // If operator is set, create/update the condition (even if value is empty)
      // If operator is empty, remove the condition
      if (operator) {
        if (operator === 'trend') {
          // Trend condition doesn't need a numeric value
          setConditions({
            ...conditions,
            [field]: { 
              operator: 'trend' as any,
              trend: trend || 'increasing'
            },
          });
        } else {
          // For numeric operators, ensure we have a valid number
          const numericValue = value ? parseFloat(value) : 0;
          // If parseFloat returns NaN, use 0 as default
          const finalValue = isNaN(numericValue) ? 0 : numericValue;
          setConditions({
            ...conditions,
            [field]: { 
              operator: operator as any, 
              value: finalValue
            },
          });
        }
      } else {
        removeCondition(field);
      }
    }
  };

  const removeCondition = (field: string) => {
    const newConditions = { ...conditions };
    delete newConditions[field as keyof typeof conditions];
    setConditions(newConditions);
  };

  // Fetch sensors on component mount
  useEffect(() => {
    const fetchSensors = async () => {
      setLoadingSensors(true);
      try {
        const sensorData = await sensorApi.getSensors();
        setSensors(sensorData.filter(s => s.enabled));
      } catch (error) {
        console.error('Error fetching sensors:', error);
        setSensors([]);
      } finally {
        setLoadingSensors(false);
      }
    };

    fetchSensors();
  }, []);

  // Initialize soil moisture condition from existing rule
  useEffect(() => {
    if (rule?.conditions?.soilMoisture) {
      const smCondition = rule.conditions.soilMoisture;
      // Check if it's the new format (has sensors array)
      if ('sensors' in smCondition && Array.isArray(smCondition.sensors)) {
        setSelectedSensors(smCondition.sensors.map(s => ({
          channel: s.channel,
          operator: s.operator,
          value: s.value.toString(),
        })));
        setSensorLogic(smCondition.logic || 'AND');
      } else {
        // Convert old single-sensor format to new multi-sensor format
        const oldCondition = smCondition as { operator: '>=' | '<=' | '>' | '<' | '=='; value: number };
        // Find the first available sensor (or use channel 1 as default)
        const firstSensor = sensors.length > 0 ? sensors[0] : null;
        if (oldCondition.operator && oldCondition.value !== undefined) {
          setSelectedSensors([{
            channel: firstSensor?.channel || 1,
            operator: oldCondition.operator,
            value: oldCondition.value.toString(),
          }]);
          setSensorLogic('AND');
        } else {
          setSelectedSensors([]);
        }
      }
    } else {
      // Initialize with empty array if no condition exists
      setSelectedSensors([]);
    }
  }, [rule, sensors]);

  // Fetch devices when set_rain_delay action is selected
  useEffect(() => {
    const fetchDevices = async () => {
      if (actions.type === 'set_rain_delay') {
        setLoadingDevices(true);
        try {
          const deviceData = await rachioApi.getDevices();
          setDevices(deviceData);
        } catch (error) {
          console.error('Error fetching devices:', error);
          setDevices([]);
        } finally {
          setLoadingDevices(false);
        }
      } else {
        // Clear devices when not using set_rain_delay
        setDevices([]);
      }
    };

    fetchDevices();
  }, [actions.type]);

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
    { key: 'rain24h' as const, label: 'Rain 24h', unit: '"' },
    { key: 'rain1h' as const, label: 'Rain 1h', unit: '"' },
    { key: 'soilMoisture' as const, label: 'Soil Moisture', unit: '%' },
    { key: 'temperature' as const, label: 'Temperature', unit: '°F' },
    { key: 'humidity' as const, label: 'Humidity', unit: '%' },
    { key: 'pressure' as const, label: 'Pressure', unit: 'inHg' },
  ];

  const handleZoneToggle = (zoneId: string) => {
    const currentZoneIds = actions.zoneIds || [];
    const newZoneIds = currentZoneIds.includes(zoneId)
      ? currentZoneIds.filter(id => id !== zoneId)
      : [...currentZoneIds, zoneId];
    
    setActions({ ...actions, zoneIds: newZoneIds });
  };

  const handleDeviceToggle = (deviceId: string) => {
    const currentDeviceIds = actions.deviceIds || [];
    const newDeviceIds = currentDeviceIds.includes(deviceId)
      ? currentDeviceIds.filter(id => id !== deviceId)
      : [...currentDeviceIds, deviceId];
    
    setActions({ ...actions, deviceIds: newDeviceIds });
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
        <div className="mb-4">
          <label className="text-sm font-semibold text-slate-700">Conditions</label>
          <span className="text-xs text-slate-500 ml-2">(All conditions must be met)</span>
        </div>
        <div className="space-y-3">
          {conditionFields.map((field) => {
            // Special handling for soilMoisture field
            if (field.key === 'soilMoisture') {
              return (
                <div key={field.key} className="bg-white p-4 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm font-medium text-slate-700">{field.label}:</span>
                  </div>
                  <div className="space-y-3">
                      {loadingSensors ? (
                        <div className="text-sm text-slate-500 py-2">Loading sensors...</div>
                      ) : sensors.length === 0 ? (
                        <div className="text-sm text-amber-600 py-2 bg-amber-50 border border-amber-200 rounded-lg px-3">
                          No sensors available. Make sure sensors are enabled in the Sensors page.
                        </div>
                      ) : (
                        <>
                          <div className="space-y-2">
                            {selectedSensors.map((sensorCond, idx) => {
                              const sensor = sensors.find(s => s.channel === sensorCond.channel);
                              return (
                                <div key={idx} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                                  <select
                                    value={sensorCond.channel || ''}
                                    onChange={(e) => {
                                      const newSensors = [...selectedSensors];
                                      newSensors[idx] = { ...newSensors[idx], channel: parseInt(e.target.value) };
                                      setSelectedSensors(newSensors);
                                    }}
                                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  >
                                    <option value="">Select sensor...</option>
                                    {sensors.map(s => (
                                      <option key={s.id} value={s.channel}>
                                        {s.name} (Channel {s.channel})
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    value={sensorCond.operator}
                                    onChange={(e) => {
                                      const newSensors = [...selectedSensors];
                                      newSensors[idx] = { ...newSensors[idx], operator: e.target.value };
                                      setSelectedSensors(newSensors);
                                    }}
                                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  >
                                    <option value="">Operator</option>
                                    <option value=">=">≥</option>
                                    <option value="<=">≤</option>
                                    <option value=">">&gt;</option>
                                    <option value="<">&lt;</option>
                                    <option value="==">=</option>
                                  </select>
                                  <input
                                    type="number"
                                    step="0.1"
                                    value={sensorCond.value}
                                    onChange={(e) => {
                                      const newSensors = [...selectedSensors];
                                      newSensors[idx] = { ...newSensors[idx], value: e.target.value };
                                      setSelectedSensors(newSensors);
                                    }}
                                    className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="0"
                                  />
                                  <span className="text-sm text-slate-600 font-medium">{field.unit}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedSensors(selectedSensors.filter((_, i) => i !== idx));
                                    }}
                                    className="px-2 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  >
                                    ✕
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedSensors([...selectedSensors, { channel: 0, operator: '', value: '' }]);
                              }}
                              className="px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                            >
                              + Add Sensor
                            </button>
                            {selectedSensors.length === 0 && (
                              <span className="text-sm text-slate-500 italic">Click "+ Add Sensor" to configure soil moisture condition</span>
                            )}
                            {selectedSensors.length > 1 && (
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-slate-600">Logic:</span>
                                <select
                                  value={sensorLogic}
                                  onChange={(e) => setSensorLogic(e.target.value as 'AND' | 'OR')}
                                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                  <option value="AND">AND (all must meet)</option>
                                  <option value="OR">OR (any can meet)</option>
                                </select>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                </div>
              );
            }

            // Regular condition fields
            const condition = conditions[field.key];
            // Note: trend conditions are only available for temperature, humidity, and pressure
            // rain24h and rain1h do not support trend conditions (only numeric comparisons)
            const isTrendField = field.key === 'temperature' || field.key === 'humidity' || field.key === 'pressure';
            const isTrendOperator = condition?.operator === 'trend';
            
            return (
              <div key={field.key} className="flex items-center gap-3 bg-white p-3 rounded-lg border border-slate-200">
                <span className="w-32 text-sm font-medium text-slate-700">{field.label}:</span>
                <select
                  value={condition?.operator || ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      if (e.target.value === 'trend') {
                        updateCondition(field.key, 'trend', '', 'increasing');
                      } else {
                        // When switching from trend to numeric operator, condition.value may not exist
                        // Use a default value of 0 if condition.value is undefined or NaN
                        const currentValue = condition?.value;
                        const valueStr = (currentValue !== undefined && currentValue !== null && !isNaN(currentValue))
                          ? currentValue.toString()
                          : '0';
                        updateCondition(field.key, e.target.value, valueStr);
                      }
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
                  {isTrendField && <option value="trend">Trend (7 days)</option>}
                </select>
                {condition && isTrendOperator && (
                  <>
                    <select
                      value={condition.trend || 'increasing'}
                      onChange={(e) => updateCondition(field.key, 'trend', '', e.target.value as 'increasing' | 'decreasing')}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    >
                      <option value="increasing">Increasing</option>
                      <option value="decreasing">Decreasing</option>
                    </select>
                    <span className="text-xs text-slate-500">(last 7 days)</span>
                  </>
                )}
                {condition && !isTrendOperator && (
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
        <div className="mb-4">
          <label className="text-sm font-semibold text-slate-700">Action</label>
        </div>
        <div className="space-y-4">
          <select
            value={actions.type}
            onChange={(e) => {
              const newType = e.target.value as 'set_rain_delay' | 'run_zone';
              setActions({ 
                type: newType, 
                hours: newType === 'set_rain_delay' ? (actions.hours || undefined) : undefined,
                minutes: newType === 'run_zone' ? (actions.minutes || undefined) : undefined,
                zoneIds: newType === 'run_zone' ? (actions.zoneIds || []) : undefined,
                deviceIds: newType === 'set_rain_delay' ? (actions.deviceIds || []) : undefined
              });
            }}
            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
          >
            <option value="set_rain_delay">Set Rain Delay</option>
            <option value="run_zone">Run Zone(s)</option>
          </select>
          {actions.type === 'set_rain_delay' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Duration (Hours) <span className="text-red-500">*</span></label>
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
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Select Device(s) <span className="text-slate-400 text-xs font-normal">(Optional - leave empty to apply to all devices)</span>
                </label>
                {loadingDevices ? (
                  <div className="text-sm text-slate-500 py-2">Loading devices...</div>
                ) : devices.length === 0 ? (
                  <div className="text-sm text-amber-600 py-2 bg-amber-50 border border-amber-200 rounded-lg px-3">
                    No devices found. Make sure your Rachio devices are synced.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                    {devices.map((device) => {
                      const isSelected = (actions.deviceIds || []).includes(device.id);
                      return (
                        <div
                          key={device.id}
                          onClick={() => handleDeviceToggle(device.id)}
                          className={`relative bg-white rounded-lg border-2 overflow-hidden cursor-pointer transition-all hover:shadow-sm ${
                            isSelected
                              ? 'border-blue-500 shadow-sm ring-1 ring-blue-200'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {/* Selection Indicator */}
                          {isSelected && (
                            <div className="absolute top-1 right-1 z-10">
                              <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center shadow-md">
                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            </div>
                          )}
                          
                          {/* Device Info - Compact */}
                          <div className="p-2">
                            <div className="flex items-center gap-1.5 mb-1">
                              <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                              </svg>
                              <div className="text-xs font-semibold text-slate-900 truncate flex-1">{device.name}</div>
                            </div>
                            <div className="text-[10px] text-slate-500">
                              <span className={`font-medium ${device.status === 'ONLINE' ? 'text-green-600' : 'text-slate-600'}`}>{device.status}</span>
                              {device.zones && device.zones.length > 0 && (
                                <span className="ml-1.5">• {device.zones.length} zone{device.zones.length !== 1 ? 's' : ''}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {(actions.deviceIds || []).length > 0 && (
                  <p className="text-xs text-slate-600 mt-2">
                    {(actions.deviceIds || []).length} device{(actions.deviceIds || []).length !== 1 ? 's' : ''} selected
                  </p>
                )}
                {(actions.deviceIds || []).length === 0 && !loadingDevices && devices.length > 0 && (
                  <p className="text-xs text-slate-500 mt-2">No devices selected - will apply to all devices by default</p>
                )}
              </div>
            </>
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
                              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                              </svg>
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
                            {zone.cooldownPeriodDays !== null && zone.cooldownPeriodDays !== undefined && (
                              <div className="text-[10px] text-blue-600 mt-0.5">
                                Cooldown: {zone.cooldownPeriodDays} day{zone.cooldownPeriodDays !== 1 ? 's' : ''}
                              </div>
                            )}
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
