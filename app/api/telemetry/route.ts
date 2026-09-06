import { getConfig } from '@/lib/runtime-config';
import { requireUser } from '@/lib/auth';

type DatadogSeries = { pointlist?: Array<[number, number | null]> };
type DatadogResponse = { series?: DatadogSeries[]; message?: string };

async function queryLatest(query: string, from: number, to: number) {
  const configuredSite = getConfig('DATADOG_SITE') || 'datadoghq.com';
  const site = configuredSite.startsWith('api.')
    ? configuredSite
    : `api.${configuredSite}`;
  const url = new URL(`https://${site}/api/v1/query`);
  url.searchParams.set('from', String(from));
  url.searchParams.set('to', String(to));
  url.searchParams.set('query', query);
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'DD-API-KEY': getConfig('DATADOG_API_KEY'),
      'DD-APPLICATION-KEY': getConfig('DATADOG_APP_KEY'),
    },
  });
  const payload = (await response.json()) as DatadogResponse;
  if (!response.ok) throw new Error(payload.message ?? 'Datadog query failed.');
  const points =
    payload.series?.flatMap((series) => series.pointlist ?? []) ?? [];
  const latest = points
    .filter((point) => point[1] !== null)
    .sort((a, b) => b[0] - a[0])[0];
  return latest?.[1] ?? null;
}

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;
  const queries = {
    checkoutSuccess: getConfig('DATADOG_CHECKOUT_SUCCESS_QUERY'),
    paymentFailures: getConfig('DATADOG_PAYMENT_FAILURE_QUERY'),
    queueLagSeconds: getConfig('DATADOG_QUEUE_LAG_QUERY'),
  };
  if (
    !getConfig('DATADOG_API_KEY') ||
    !getConfig('DATADOG_APP_KEY') ||
    Object.values(queries).some((value) => !value)
  ) {
    return Response.json({
      source: 'unavailable',
      configured: false,
      error: 'Datadog credentials or metric queries are missing.',
    });
  }
  const to = Math.floor(Date.now() / 1000);
  const from = to - 300;
  try {
    const [checkoutSuccess, paymentFailures, queueLagSeconds] =
      await Promise.all([
        queryLatest(queries.checkoutSuccess!, from, to),
        queryLatest(queries.paymentFailures!, from, to),
        queryLatest(queries.queueLagSeconds!, from, to),
      ]);
    return Response.json({
      source: 'datadog',
      configured: true,
      observedAt: new Date().toISOString(),
      checkoutSuccess,
      paymentFailures,
      queueLagSeconds,
    });
  } catch (error) {
    return Response.json(
      {
        source: 'unavailable',
        configured: true,
        error:
          error instanceof Error ? error.message : 'Telemetry query failed.',
      },
      { status: 502 },
    );
  }
}
