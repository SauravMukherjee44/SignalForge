'use client';

import {
  CheckCircle2,
  DatabaseZap,
  EyeOff,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { BrandIcon } from '@/components/brand-icon';

export type ConfigProvider =
  | 'agora'
  | 'gemini'
  | 'datadog'
  | 'opentelemetry'
  | 'slack'
  | 'jira';

type Field = {
  key: string;
  label: string;
  placeholder: string;
  secret?: boolean;
  initial?: string;
};

const providerFields: Record<ConfigProvider, Field[]> = {
  agora: [
    {
      key: 'NEXT_PUBLIC_AGORA_APP_ID',
      label: 'Agora App ID',
      placeholder: '32-character App ID',
      initial: '',
    },
    {
      key: 'AGORA_APP_CERTIFICATE',
      label: 'Primary App Certificate',
      placeholder: 'Paste certificate from Agora Console',
      secret: true,
    },
  ],
  gemini: [
    {
      key: 'GEMINI_API_KEY',
      label: 'Gemini API key',
      placeholder: 'Paste Google AI Studio API key',
      secret: true,
    },
    {
      key: 'GEMINI_MODEL',
      label: 'Model',
      placeholder: 'gemini-3.5-flash-lite',
      initial: 'gemini-3.5-flash-lite',
    },
    {
      key: 'GEMINI_LIVE_MODEL',
      label: 'Live voice model',
      placeholder: 'gemini-3.1-flash-live-preview',
      initial: 'gemini-3.1-flash-live-preview',
    },
  ],
  datadog: [
    {
      key: 'DATADOG_API_KEY',
      label: 'Datadog API key',
      placeholder: 'Used for telemetry ingestion',
      secret: true,
    },
    {
      key: 'DATADOG_APP_KEY',
      label: 'Datadog Application key',
      placeholder: 'Required only for metric queries',
      secret: true,
    },
    {
      key: 'DATADOG_SITE',
      label: 'Datadog site',
      placeholder: 'datadoghq.com',
      initial: 'datadoghq.com',
    },
    {
      key: 'DATADOG_CHECKOUT_SUCCESS_QUERY',
      label: 'Checkout success query',
      placeholder: 'avg:payments.checkout.success{region:apac}',
    },
    {
      key: 'DATADOG_PAYMENT_FAILURE_QUERY',
      label: 'Payment failure query',
      placeholder: 'avg:payments.failure.rate{region:apac}',
    },
    {
      key: 'DATADOG_QUEUE_LAG_QUERY',
      label: 'Queue lag query',
      placeholder: 'avg:payments.queue.lag{region:apac}',
    },
    {
      key: 'DATADOG_DASHBOARD_EMBED_BASE_URL',
      label: 'Secure dashboard embed base URL',
      placeholder: 'https://p.datadoghq.com/sb/...',
    },
    {
      key: 'DATADOG_DASHBOARD_EMBED_CREDENTIAL',
      label: 'Secure embed credential',
      placeholder: 'Stored server-side for signed sessions',
      secret: true,
    },
  ],
  opentelemetry: [
    {
      key: 'OTEL_EXPORTER_OTLP_ENDPOINT',
      label: 'OTLP/HTTP collector endpoint',
      placeholder: 'http://localhost:4318',
      initial: 'http://localhost:4318',
    },
  ],
  slack: [
    {
      key: 'SLACK_BOT_TOKEN',
      label: 'Bot token',
      placeholder: 'xoxb-…',
      secret: true,
    },
    {
      key: 'SLACK_CHANNEL_ID',
      label: 'Incident channel ID',
      placeholder: 'C0123456789',
    },
  ],
  jira: [
    {
      key: 'JIRA_BASE_URL',
      label: 'Site URL',
      placeholder: 'https://team.atlassian.net',
    },
    {
      key: 'JIRA_EMAIL',
      label: 'Account email',
      placeholder: 'operator@company.com',
    },
    {
      key: 'JIRA_API_TOKEN',
      label: 'API token',
      placeholder: 'Paste token',
      secret: true,
    },
    { key: 'JIRA_PROJECT_KEY', label: 'Project key', placeholder: 'OPS' },
  ],
};

const providerLabels: Record<ConfigProvider, string> = {
  agora: 'Agora',
  gemini: 'Gemini',
  datadog: 'Datadog',
  opentelemetry: 'OTel Collector',
  slack: 'Slack',
  jira: 'Jira',
};

export function IntegrationVault({
  provider,
  onProviderChange,
  onSaved,
}: {
  provider: ConfigProvider;
  onProviderChange: (provider: ConfigProvider) => void;
  onSaved: () => void;
}) {
  const fields = providerFields[provider];
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.key, field.initial ?? ''])),
  );
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [collectorConnected, setCollectorConnected] = useState<boolean | null>(
    null,
  );

  const changed = useMemo(
    () => Object.values(values).some((value) => value.trim()),
    [values],
  );

  const save = async () => {
    setSaving(true);
    setResult(null);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      });
      const payload = (await response.json()) as {
        saved?: string[];
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error ?? 'Configuration could not be saved.');
      setValues(
        Object.fromEntries(
          fields.map((field) => [
            field.key,
            field.secret ? '' : (values[field.key] ?? ''),
          ]),
        ),
      );
      setResult(
        `Saved ${payload.saved?.length ?? 0} setting${payload.saved?.length === 1 ? '' : 's'} to the local session vault.`,
      );
      onSaved();
    } catch (error) {
      setResult(
        error instanceof Error ? error.message : 'Configuration failed.',
      );
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    setResult(null);
    try {
      await fetch('/api/settings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: fields.map((field) => field.key) }),
      });
      setValues(
        Object.fromEntries(
          fields.map((field) => [field.key, field.initial ?? '']),
        ),
      );
      setResult(`${providerLabels[provider]} session settings cleared.`);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const testCollector = async () => {
    setCollectorConnected(null);
    setResult('Sending a trace, metric, and log through OTLP…');
    const response = await fetch('/api/otel-test', { method: 'POST' });
    const payload = (await response.json()) as {
      delivered?: boolean;
      traceId?: string;
      error?: string;
    };
    setCollectorConnected(Boolean(payload.delivered));
    setResult(
      payload.delivered
        ? `All three signals accepted. Trace ${payload.traceId?.slice(0, 12)}…`
        : (payload.error ?? 'Collector is not reachable.'),
    );
  };

  return (
    <section
      className="configuration-vault glass-card"
      id="configuration-vault"
    >
      <div className="vault-sidebar">
        <span className="vault-icon">
          <DatabaseZap size={22} />
        </span>
        <span className="eyebrow">LOCAL CONFIGURATION VAULT</span>
        <h2>Connect your own operations stack</h2>
        <p>
          Credentials are held only in server memory for this local session.
          They are never read back into the browser.
        </p>
        <div className="vault-provider-list">
          {(Object.keys(providerLabels) as ConfigProvider[]).map((item) => (
            <button
              className={provider === item ? 'active' : ''}
              key={item}
              onClick={() => onProviderChange(item)}
            >
              <BrandIcon brand={item} size="sm" />
              {providerLabels[item]}
            </button>
          ))}
        </div>
      </div>
      <div className="vault-form">
        <div className="vault-form-heading">
          <div className="vault-configuring">
            <BrandIcon brand={provider} size="md" labelled />
            <div>
              <small>CONFIGURING</small>
              <h3>{providerLabels[provider]}</h3>
            </div>
          </div>
          <span>
            <EyeOff size={15} /> Secret values stay masked
          </span>
        </div>
        <div className="vault-fields">
          {fields.map((field) => (
            <label key={field.key}>
              <span>
                {field.label}
                {field.secret && <em>secret</em>}
              </span>
              <input
                type={field.secret ? 'password' : 'text'}
                autoComplete="off"
                value={values[field.key] ?? ''}
                placeholder={field.placeholder}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [field.key]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
        </div>
        {provider === 'opentelemetry' && (
          <div className="collector-callout">
            <div>
              <b>Collector pipeline</b>
              <span>SignalForge → OTLP :4318 → Datadog connector/exporter</span>
            </div>
            <button onClick={() => void testCollector()}>
              <RefreshCw size={15} /> Send test signals
            </button>
          </div>
        )}
        <div className="vault-actions">
          <button
            className="vault-clear"
            onClick={() => void clear()}
            disabled={saving}
          >
            <Trash2 size={16} /> Clear session
          </button>
          <button
            className="vault-save"
            onClick={() => void save()}
            disabled={saving || !changed}
          >
            {saving ? (
              <RefreshCw className="spin" size={16} />
            ) : (
              <Save size={16} />
            )}
            Save securely
          </button>
        </div>
        {result && (
          <output
            className={
              collectorConnected === false
                ? 'vault-result error'
                : 'vault-result'
            }
          >
            {collectorConnected === true && <CheckCircle2 size={15} />}
            {result}
          </output>
        )}
        <div className="vault-footnote">
          <ShieldCheck size={15} /> For persistent deployments, use encrypted
          platform secrets instead of the session vault.
        </div>
      </div>
    </section>
  );
}
