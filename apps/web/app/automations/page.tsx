'use client';

import { useEffect, useState } from 'react';
import { automationApi, AutomationRule } from '../../lib/api';
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

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      if (enabled) {
        await automationApi.enableRule(id);
      } else {
        await automationApi.disableRule(id);
      }
      await fetchRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update rule');
    }
  };

  const handleDelete = async (id: string) => {
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
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Automation Rules</h1>
            <p className="text-gray-600 mt-1">Manage your irrigation automation rules</p>
          </div>
          <div className="flex gap-4">
            <Link
              href="/"
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Back to Dashboard
            </Link>
            <button
              onClick={() => setEditingId('new')}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              + New Rule
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
            {error}
          </div>
        )}

        {editingId === 'new' && (
          <RuleEditor
            rule={null}
            onSave={(rule) => {
              automationApi.createRule(rule).then(() => {
                setEditingId(null);
                fetchRules();
              });
            }}
            onCancel={() => setEditingId(null)}
          />
        )}

        <div className="space-y-4">
          {rules.map((rule) => (
            <div key={rule.id} className="bg-white rounded-lg shadow p-6">
              {editingId === rule.id ? (
                <RuleEditor
                  rule={rule}
                  onSave={handleSave}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <RuleView
                  rule={rule}
                  onEdit={() => setEditingId(rule.id)}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              )}
            </div>
          ))}
        </div>

        {rules.length === 0 && !editingId && (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <p className="text-gray-500">No automation rules yet. Create one to get started.</p>
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
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const formatConditions = () => {
    const conditions: string[] = [];
    if (rule.conditions.rain24h) {
      conditions.push(`Rain 24h ${rule.conditions.rain24h.operator} ${rule.conditions.rain24h.value}"`);
    }
    if (rule.conditions.soilMoisture) {
      conditions.push(`Soil Moisture ${rule.conditions.soilMoisture.operator} ${rule.conditions.soilMoisture.value}%`);
    }
    if (rule.conditions.rain1h) {
      conditions.push(`Rain 1h ${rule.conditions.rain1h.operator} ${rule.conditions.rain1h.value}"`);
    }
    if (rule.conditions.temperature) {
      conditions.push(`Temperature ${rule.conditions.temperature.operator} ${rule.conditions.temperature.value}°F`);
    }
    if (rule.conditions.humidity) {
      conditions.push(`Humidity ${rule.conditions.humidity.operator} ${rule.conditions.humidity.value}%`);
    }
    return conditions.join(' AND ');
  };

  const formatActions = () => {
    if (rule.actions.type === 'set_rain_delay') {
      return `Set rain delay for ${rule.actions.hours} hours`;
    }
    if (rule.actions.type === 'run_zone') {
      return `Run lawn zone for ${rule.actions.minutes} minutes`;
    }
    return 'Unknown action';
  };

  return (
    <div>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-xl font-semibold text-gray-900">{rule.name}</h3>
            <span
              className={`px-2 py-1 text-xs rounded-full ${
                rule.enabled
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              {rule.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div className="text-sm text-gray-600 space-y-1">
            <p>
              <strong>Conditions:</strong> {formatConditions() || 'None'}
            </p>
            <p>
              <strong>Actions:</strong> {formatActions()}
            </p>
            {rule.lastRunAt && (
              <p>
                <strong>Last Run:</strong> {new Date(rule.lastRunAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onToggle(rule.id, !rule.enabled)}
            className={`px-3 py-1 text-sm rounded ${
              rule.enabled
                ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                : 'bg-green-100 text-green-800 hover:bg-green-200'
            }`}
          >
            {rule.enabled ? 'Disable' : 'Enable'}
          </button>
          <button
            onClick={onEdit}
            className="px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(rule.id)}
            className="px-3 py-1 text-sm bg-red-100 text-red-800 rounded hover:bg-red-200"
          >
            Delete
          </button>
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Rule name is required');
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Rule Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          required
        />
      </div>

      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span className="text-sm font-medium text-gray-700">Enabled</span>
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Conditions</label>
        <div className="space-y-2">
          {(['rain24h', 'soilMoisture', 'rain1h', 'temperature', 'humidity'] as const).map((field) => {
            const condition = conditions[field];
            return (
              <div key={field} className="flex gap-2 items-center">
                <span className="w-32 text-sm text-gray-600 capitalize">{field.replace(/([A-Z])/g, ' $1').trim()}:</span>
                <select
                  value={condition?.operator || ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      updateCondition(field, e.target.value, condition?.value?.toString() || '');
                    } else {
                      removeCondition(field);
                    }
                  }}
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                >
                  <option value="">None</option>
                  <option value=">=">≥</option>
                  <option value="<=">≤</option>
                  <option value=">">&gt;</option>
                  <option value="<">&lt;</option>
                  <option value="==">=</option>
                </select>
                {condition && (
                  <>
                    <input
                      type="number"
                      step="0.1"
                      value={condition.value || ''}
                      onChange={(e) => updateCondition(field, condition.operator, e.target.value)}
                      className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                      required
                    />
                    <span className="text-sm text-gray-500">
                      {field === 'soilMoisture' || field === 'humidity' ? '%' : field.includes('rain') ? '"' : '°F'}
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Actions</label>
        <div className="space-y-2">
          <select
            value={actions.type}
            onChange={(e) => setActions({ type: e.target.value as any, hours: undefined, minutes: undefined })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="set_rain_delay">Set Rain Delay</option>
            <option value="run_zone">Run Lawn Zone</option>
          </select>
          {actions.type === 'set_rain_delay' && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">Hours</label>
              <input
                type="number"
                min="1"
                value={actions.hours || ''}
                onChange={(e) => setActions({ ...actions, hours: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              />
            </div>
          )}
          {actions.type === 'run_zone' && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">Minutes</label>
              <input
                type="number"
                min="1"
                value={actions.minutes || ''}
                onChange={(e) => setActions({ ...actions, minutes: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 pt-4">
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

