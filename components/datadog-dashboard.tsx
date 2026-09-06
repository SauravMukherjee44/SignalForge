'use client';

import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Cpu,
  Database,
  Gauge,
  HardDrive,
  RefreshCw,
  ServerCog,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BrandIcon } from '@/components/brand-icon';

type Range = '1h' | '4h' | '24h';
type MetricFormat = 'percent' | 'bytes' | 'count' | 'milliseconds';
type DashboardMetric = {
  id: string;
  label: string;
  query: string;
  format: MetricFormat;
  value: number | null;
  points: Array<[number, number]>;
  lastPointAt: string | null;
  error?: string;
};
type DashboardLog = {
  id: string;
  timestamp: string;
  message: string;
  status: string;
  service: string;
  attributes: Record<string, unknown>;
};
type DashboardPayload = {
  configured: boolean;
  source?: 'datadog';
  observedAt?: string;
  range?: Range;
  metrics?: DashboardMetric[];
  logs?: DashboardLog[];
  embedUrl?: string | null;
  health?: { metrics: boolean; logs: boolean; secureEmbed: boolean };
  errors?: string[];
  error?: string;
};

const rangeLabels: Record<Range, string> = {
  '1h': '1 hour',
  '4h': '4 hours',
  '24h': '24 hours',
};

const metricIcons = {
  cpu: Cpu,
  memory: HardDrive,
  'incident-events': Activity,
  'request-hits': ServerCog,
  'request-latency': Gauge,
};

function formatValue(value: number | null, format: MetricFormat) {
  if (value === null) return 'No data';
  if (format === 'percent') return `${value.toFixed(1)}%`;
  if (format === 'milliseconds')
    return `${value.toFixed(value < 10 ? 2 : 0)} ms`;
  if (format === 'bytes') {
    const units = ['B', 'KB', 'MB', 'GB'];
    let scaled = value;
    let index = 0;
    while (scaled >= 1_024 && index < units.length - 1) {
      scaled /= 1_024;
      index += 1;
    }
    return `${scaled.toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
  }
  return Math.round(value).toLocaleString();
}

function ageLabel(timestamp: string | null) {
  if (!timestamp) return 'No matching series';
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(timestamp).getTime()) / 1_000),
  );
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3_600)}h ago`;
}

function clock(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function MetricChart({ metric }: { metric: DashboardMetric }) {
  const path = useMemo(() => {
    if (metric.points.length < 2) return '';
    const values = metric.points.map((point) => point[1]);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const spread = Math.max(maximum - minimum, Math.abs(maximum) * 0.05, 1);
    return metric.points
      .map((point, index) => {
        const x = (index / (metric.points.length - 1)) * 100;
        const y = 45 - ((point[1] - minimum) / spread) * 38;
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  }, [metric]);
  const Icon = metricIcons[metric.id as keyof typeof metricIcons] ?? Database;

  return (
    <article className={`dd-metric-card dd-metric-${metric.id}`}>
      <div className="dd-metric-title">
        <span>
          <Icon size={16} />
        </span>
        <div>
          <b>{metric.label}</b>
          <small>{ageLabel(metric.lastPointAt)}</small>
        </div>
      </div>
      <strong>{formatValue(metric.value, metric.format)}</strong>
      <div className="dd-chart" aria-label={`${metric.label} time series`}>
        {path ? (
          <svg
            viewBox="0 0 100 48"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient
                id={`fill-${metric.id}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0" stopColor="currentColor" stopOpacity=".24" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d={`${path} L 100 48 L 0 48 Z`}
              fill={`url(#fill-${metric.id})`}
            />
            <path
              d={path}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : (
          <div className="dd-chart-empty">Waiting for this Datadog series</div>
        )}
      </div>
      <code>{metric.query}</code>
    </article>
  );
}

export function DatadogDashboard() {
  const [range, setRange] = useState<Range>('4h');
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'native' | 'embed'>('native');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/datadog-dashboard?range=${range}`, {
        cache: 'no-store',
      });
      const result = (await response.json()) as DashboardPayload;
      if (!response.ok)
        throw new Error(result.error ?? 'Datadog query failed.');
      setPayload(result);
      setError(null);
      if (!result.embedUrl) setMode('native');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Datadog query failed.',
      );
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const metrics = payload?.metrics ?? [];
  const logs = payload?.logs ?? [];
  const externalLogsUrl =
    'https://app.datadoghq.com/logs?query=service%3Asignalforge';

  return (
    <div className="detail-view datadog-view view-enter">
      <header className="dd-dashboard-header">
        <div className="dd-dashboard-brand">
          <span className="dd-brand-orb">
            <BrandIcon brand="datadog" size="lg" labelled />
          </span>
          <div>
            <span className="eyebrow">DATADOG OPERATIONS CENTER</span>
            <h2>SignalForge observability</h2>
            <p>Metrics, traces, and logs queried directly from Datadog.</p>
          </div>
        </div>
        <div className="dd-dashboard-controls">
          {payload?.embedUrl && (
            <div className="dd-mode-switch" aria-label="Dashboard mode">
              <button
                className={mode === 'native' ? 'active' : ''}
                onClick={() => setMode('native')}
              >
                Operations
              </button>
              <button
                className={mode === 'embed' ? 'active' : ''}
                onClick={() => setMode('embed')}
              >
                Datadog embed
              </button>
            </div>
          )}
          <div className="dd-range-switch" aria-label="Datadog time range">
            {(Object.keys(rangeLabels) as Range[]).map((item) => (
              <button
                key={item}
                className={range === item ? 'active' : ''}
                onClick={() => setRange(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <button
            className="dd-refresh"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw className={loading ? 'spin' : ''} size={15} />
            Refresh
          </button>
          <a href={externalLogsUrl} target="_blank" rel="noreferrer">
            Open Datadog <ArrowUpRight size={15} />
          </a>
        </div>
      </header>

      <section className="dd-health-strip glass-card">
        <div>
          <span className="dd-live-dot" />
          <b>API stream active</b>
          <small>Auto-refresh every 15 seconds</small>
        </div>
        <div>
          {payload?.health?.metrics ? (
            <CheckCircle2 size={17} />
          ) : (
            <AlertTriangle size={17} />
          )}
          <b>Metrics</b>
          <small>
            {payload?.health?.metrics
              ? 'Series received'
              : 'No series in window'}
          </small>
        </div>
        <div>
          {payload?.health?.logs ? (
            <CheckCircle2 size={17} />
          ) : (
            <AlertTriangle size={17} />
          )}
          <b>Logs</b>
          <small>{logs.length} SignalForge events</small>
        </div>
        <div>
          <Clock3 size={17} />
          <b>{rangeLabels[range]}</b>
          <small>Synced {clock(payload?.observedAt)}</small>
        </div>
      </section>

      {error && <div className="dd-dashboard-error">{error}</div>}
      {payload?.errors?.length ? (
        <div className="dd-dashboard-warning">
          <AlertTriangle size={16} />
          <span>{payload.errors.join(' ')}</span>
        </div>
      ) : null}

      {mode === 'embed' && payload?.embedUrl ? (
        <section className="dd-secure-embed glass-card">
          <iframe
            src={payload.embedUrl}
            title="Secure Datadog dashboard"
            allow="fullscreen"
          />
        </section>
      ) : (
        <>
          <section className="dd-metric-grid">
            {metrics.map((metric) => (
              <MetricChart key={metric.id} metric={metric} />
            ))}
          </section>
          <section className="dd-log-explorer glass-card">
            <div className="dd-panel-heading">
              <div>
                <span className="eyebrow">LIVE LOG EXPLORER</span>
                <h3>Incident intelligence events</h3>
              </div>
              <span>
                <Activity size={14} /> service:signalforge
              </span>
            </div>
            {logs.length ? (
              <div className="dd-log-table">
                <div className="dd-log-row dd-log-header">
                  <span>Time</span>
                  <span>Status</span>
                  <span>Service</span>
                  <span>Event</span>
                </div>
                {logs.map((entry) => (
                  <article className="dd-log-row" key={entry.id}>
                    <time>{clock(entry.timestamp)}</time>
                    <span className={`log-level ${entry.status.toLowerCase()}`}>
                      {entry.status}
                    </span>
                    <code>{entry.service}</code>
                    <b>{entry.message}</b>
                  </article>
                ))}
              </div>
            ) : (
              <div className="dd-log-empty">
                <Database size={22} />
                <b>No SignalForge logs in this time range</b>
                <span>
                  Live incident actions will appear here after Datadog indexes
                  them.
                </span>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
