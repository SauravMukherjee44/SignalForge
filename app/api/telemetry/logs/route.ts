import { getConfig } from '@/lib/runtime-config';
import { requireUser } from '@/lib/auth';

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

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;
  const apiKey = getConfig('DATADOG_API_KEY');
  const appKey = getConfig('DATADOG_APP_KEY');
  if (!apiKey || !appKey) {
    return Response.json(
      { configured: false, logs: [], error: 'Datadog credentials are missing.' },
      { status: 503 },
    );
  }

  const configuredSite = getConfig('DATADOG_SITE') || 'datadoghq.com';
  const site = configuredSite.startsWith('api.')
    ? configuredSite
    : `api.${configuredSite}`;
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 60 * 1000);

  try {
    const response = await fetch(`https://${site}/api/v2/logs/events/search`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'DD-API-KEY': apiKey,
        'DD-APPLICATION-KEY': appKey,
      },
      body: JSON.stringify({
        filter: {
          from: from.toISOString(),
          to: now.toISOString(),
          query: 'service:signalforge',
        },
        sort: '-timestamp',
        page: { limit: 50 },
      }),
      cache: 'no-store',
    });
    const payload = (await response.json()) as DatadogLogResponse;
    if (!response.ok) {
      throw new Error(
        payload.errors?.[0]?.detail ||
          payload.errors?.[0]?.title ||
          `Datadog Logs returned HTTP ${response.status}.`,
      );
    }

    return Response.json({
      configured: true,
      observedAt: now.toISOString(),
      logs: (payload.data ?? []).map((entry) => ({
        id: entry.id,
        timestamp: entry.attributes?.timestamp ?? now.toISOString(),
        message: entry.attributes?.message ?? 'SignalForge event',
        status: entry.attributes?.status ?? 'info',
        service: entry.attributes?.service ?? 'signalforge',
        attributes: entry.attributes?.attributes ?? {},
      })),
    });
  } catch (error) {
    return Response.json(
      {
        configured: true,
        logs: [],
        error:
          error instanceof Error ? error.message : 'Datadog Logs query failed.',
      },
      { status: 502 },
    );
  }
}
