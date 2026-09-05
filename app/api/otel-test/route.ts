import { emitOtelIncidentEvent } from '@/lib/otel';
import { getConfig } from '@/lib/runtime-config';

export async function GET() {
  const healthEndpoint =
    getConfig('OTEL_EXPORTER_OTLP_ENDPOINT') || 'http://localhost:4318';
  const healthUrl = healthEndpoint.replace(/:\d+\/?$/, ':13133/');
  try {
    const response = await fetch(healthUrl, {
      signal: AbortSignal.timeout(1_500),
    });
    return Response.json({
      connected: response.ok,
      endpoint: healthEndpoint,
      health: response.status,
    });
  } catch {
    return Response.json({ connected: false, endpoint: healthEndpoint });
  }
}

export async function POST() {
  try {
    const result = await emitOtelIncidentEvent(
      'otel.pipeline.test',
      {
        'incident.id': 'INC-2847',
        'incident.severity': 'SEV-1',
        'test.signal': true,
      },
      {
        checkoutSuccessPercent: 98.6,
        paymentFailurePercent: 1.4,
        queueLagSeconds: 18,
      },
    );
    return Response.json({ delivered: true, ...result });
  } catch (error) {
    return Response.json(
      {
        delivered: false,
        error:
          error instanceof Error ? error.message : 'Collector unavailable.',
      },
      { status: 503 },
    );
  }
}
