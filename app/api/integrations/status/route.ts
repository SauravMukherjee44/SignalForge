import { getConfig, isConfigured } from '@/lib/runtime-config';

export async function GET() {
  const otlpEndpoint =
    getConfig('OTEL_EXPORTER_OTLP_ENDPOINT') || 'http://localhost:4318';
  let collectorConnected = false;
  try {
    const response = await fetch(otlpEndpoint.replace(/:\d+\/?$/, ':13133/'), {
      signal: AbortSignal.timeout(700),
    });
    collectorConnected = response.ok;
  } catch {
    // Report the collector as offline without blocking other statuses.
  }
  return Response.json({
    agora: {
      configured: isConfigured(['NEXT_PUBLIC_AGORA_APP_ID']),
      secure: isConfigured(['AGORA_APP_CERTIFICATE']),
    },
    gemini: { configured: isConfigured(['GEMINI_API_KEY']) },
    slack: {
      configured: isConfigured(['SLACK_BOT_TOKEN', 'SLACK_CHANNEL_ID']),
    },
    jira: {
      configured: isConfigured([
        'JIRA_BASE_URL',
        'JIRA_EMAIL',
        'JIRA_API_TOKEN',
        'JIRA_PROJECT_KEY',
      ]),
    },
    pagerduty: {
      configured: isConfigured([
        'PAGERDUTY_API_TOKEN',
        'PAGERDUTY_INCIDENT_ID',
      ]),
    },
    datadog: {
      configured: isConfigured([
        'DATADOG_API_KEY',
        'DATADOG_APP_KEY',
        'DATADOG_CHECKOUT_SUCCESS_QUERY',
        'DATADOG_PAYMENT_FAILURE_QUERY',
        'DATADOG_QUEUE_LAG_QUERY',
      ]),
    },
    opentelemetry: {
      configured: true,
      connected: collectorConnected,
    },
  });
}
