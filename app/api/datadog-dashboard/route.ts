import { requireUser } from '@/lib/auth';
import { getConfig } from '@/lib/runtime-config';

type DatadogPoint = [number, number | null];
type DatadogSeries = {
  pointlist?: DatadogPoint[];
  unit?: Array<{
    short_name?: string;
    name?: string;
    scale_factor?: number;
  } | null>;
};
type DatadogMetricResponse = {
  series?: DatadogSeries[];
  errors?: string[];
  message?: string;
};
type DatadogLog = {
  id: string;
  attributes?: {
    timestamp?: string;
    message?: string;
    status?: string;
    service?: string;
    attributes?: Record<string, unknown>;
  };
};
type DatadogLogResponse = {
  data?: DatadogLog[];
  errors?: Array<{ detail?: string; title?: string }>;
};

const ranges = {
  '1h': 60 * 60,
  '4h': 4 * 60 * 60,
  '24h': 24 * 60 * 60,
} as const;

type Range = keyof typeof ranges;

const metricDefinitions = [
  {
    id: 'cpu',
    label: 'Collector CPU',
    query: 'avg:system.cpu.utilization{*}',
    format: 'percent' as const,
    summary: 'latest' as const,
  },
  {
    id: 'memory',
    label: 'Collector memory',
    query: 'avg:system.memory.usage{*}',
    format: 'bytes' as const,
    summary: 'latest' as const,
  },
  {
    id: 'incident-events',
    label: 'Incident events',
    query: 'sum:signalforge.incident.events{*}.as_count()',
    format: 'count' as const,
    summary: 'sum' as const,
  },
  {
    id: 'request-hits',
    label: 'Traced requests',
    query: 'sum:trace.server.request.hits{service:signalforge}.as_count()',
    format: 'count' as const,
    summary: 'sum' as const,
  },
  {
    id: 'request-latency',
    label: 'Trace latency',
    query: 'avg:trace.server.request{service:signalforge}',
    format: 'milliseconds' as const,
    summary: 'latest' as const,
  },
];

function apiHost() {
  const configuredSite = getConfig('DATADOG_SITE') || 'datadoghq.com';
  return configuredSite.startsWith('api.')
    ? configuredSite
    : `api.${configuredSite}`;
}

function headers() {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'DD-API-KEY': getConfig('DATADOG_API_KEY'),
    'DD-APPLICATION-KEY': getConfig('DATADOG_APP_KEY'),
  };
}

function compactPoints(points: Array<[number, number]>, maximum = 120) {
  if (points.length <= maximum) return points;
  const stride = Math.ceil(points.length / maximum);
  return points.filter((_, index) => index % stride === 0);
}

async function queryMetric(
  definition: (typeof metricDefinitions)[number],
  from: number,
  to: number,
) {
  const url = new URL(`https://${apiHost()}/api/v1/query`);
  url.searchParams.set('from', String(from));
  url.searchParams.set('to', String(to));
  url.searchParams.set('query', definition.query);
  const response = await fetch(url, {
    headers: headers(),
    cache: 'no-store',
  });
  const payload = (await response.json()) as DatadogMetricResponse;
  if (!response.ok) {
    throw new Error(
      payload.errors?.[0] ||
        payload.message ||
        `Datadog metric query returned HTTP ${response.status}.`,
    );
  }
  const points = compactPoints(
    (payload.series ?? [])
      .flatMap((series) => series.pointlist ?? [])
      .filter((point): point is [number, number] => point[1] !== null)
      .sort((a, b) => a[0] - b[0]),
  );
  const rawValue =
    definition.summary === 'sum'
      ? points.reduce((total, point) => total + point[1], 0)
      : (points.at(-1)?.[1] ?? null);
  const transform = (value: number) =>
    definition.format === 'percent'
      ? value * 100
      : definition.format === 'milliseconds'
        ? value * 1_000
        : value;
  return {
    ...definition,
    value: rawValue === null ? null : transform(rawValue),
    points: points.map(([timestamp, value]) => [timestamp, transform(value)]),
    lastPointAt: points.length
      ? new Date(points[points.length - 1][0]).toISOString()
      : null,
  };
}

async function queryLogs(from: Date, to: Date) {
  const response = await fetch(
    `https://${apiHost()}/api/v2/logs/events/search`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        filter: {
          from: from.toISOString(),
          to: to.toISOString(),
          query: 'service:signalforge',
        },
        sort: '-timestamp',
        page: { limit: 60 },
      }),
      cache: 'no-store',
    },
  );
  const payload = (await response.json()) as DatadogLogResponse;
  if (!response.ok) {
    throw new Error(
      payload.errors?.[0]?.detail ||
        payload.errors?.[0]?.title ||
        `Datadog Logs returned HTTP ${response.status}.`,
    );
  }
  return (payload.data ?? []).map((entry) => ({
    id: entry.id,
    timestamp: entry.attributes?.timestamp ?? to.toISOString(),
    message: entry.attributes?.message ?? 'SignalForge event',
    status: entry.attributes?.status ?? 'info',
    service: entry.attributes?.service ?? 'signalforge',
    attributes: entry.attributes?.attributes ?? {},
  }));
}

async function createSecureEmbedUrl() {
  const baseUrl = getConfig('DATADOG_DASHBOARD_EMBED_BASE_URL');
  const credential = getConfig('DATADOG_DASHBOARD_EMBED_CREDENTIAL');
  if (!baseUrl || !credential) return null;
  const nonce = crypto.randomUUID();
  const timestamp = Math.floor(Date.now() / 1_000);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(credential),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${nonce}|${timestamp}`),
  );
  const token = Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  const url = new URL(baseUrl);
  url.searchParams.set('token', token);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('ts', String(timestamp));
  return url.toString();
}

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;
  if (!getConfig('DATADOG_API_KEY') || !getConfig('DATADOG_APP_KEY')) {
    return Response.json(
      { configured: false, error: 'Datadog credentials are missing.' },
      { status: 503 },
    );
  }

  const requestedRange = new URL(request.url).searchParams.get('range');
  const range: Range =
    requestedRange && requestedRange in ranges
      ? (requestedRange as Range)
      : '4h';
  const to = new Date();
  const from = new Date(to.getTime() - ranges[range] * 1_000);

  const [metricResults, logResult, embedResult] = await Promise.all([
    Promise.allSettled(
      metricDefinitions.map((definition) =>
        queryMetric(
          definition,
          Math.floor(from.getTime() / 1_000),
          Math.floor(to.getTime() / 1_000),
        ),
      ),
    ),
    queryLogs(from, to).then(
      (logs) => ({ logs, error: null }),
      (error: unknown) => ({
        logs: [],
        error:
          error instanceof Error ? error.message : 'Datadog log query failed.',
      }),
    ),
    createSecureEmbedUrl().catch(() => null),
  ]);

  const metrics = metricResults.map((result, index) =>
    result.status === 'fulfilled'
      ? result.value
      : {
          ...metricDefinitions[index],
          value: null,
          points: [],
          lastPointAt: null,
          error:
            result.reason instanceof Error
              ? result.reason.message
              : 'Metric query failed.',
        },
  );
  const queryErrors = metrics
    .filter((metric) => 'error' in metric && metric.error)
    .map((metric) => ('error' in metric ? metric.error : null));

  return Response.json({
    configured: true,
    source: 'datadog',
    observedAt: to.toISOString(),
    range,
    metrics,
    logs: logResult.logs,
    embedUrl: embedResult,
    health: {
      metrics: metrics.some((metric) => metric.points.length > 0),
      logs: !logResult.error,
      secureEmbed: Boolean(embedResult),
    },
    errors: [...queryErrors, logResult.error].filter(Boolean),
  });
}
