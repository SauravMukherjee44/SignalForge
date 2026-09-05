import { getConfig } from '@/lib/runtime-config';

const nowNanos = () => `${BigInt(Date.now()) * BigInt(1_000_000)}`;
const randomHex = (bytes: number) => {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return Array.from(values, (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
};
const attributes = (values: Record<string, string | number | boolean>) =>
  Object.entries(values).map(([key, value]) => ({
    key,
    value:
      typeof value === 'number'
        ? { doubleValue: value }
        : typeof value === 'boolean'
          ? { boolValue: value }
          : { stringValue: value },
  }));

const resource = {
  attributes: [
    { key: 'service.name', value: { stringValue: 'signalforge' } },
    {
      key: 'deployment.environment',
      value: { stringValue: 'local-hackathon' },
    },
  ],
};

async function send(path: string, body: object) {
  const endpoint =
    getConfig('OTEL_EXPORTER_OTLP_ENDPOINT') || 'http://localhost:4318';
  const response = await fetch(`${endpoint.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(`Collector returned HTTP ${response.status}.`);
}

export async function emitOtelIncidentEvent(
  name: string,
  values: Record<string, string | number | boolean> = {},
  measurements?: {
    checkoutSuccessPercent: number;
    paymentFailurePercent: number;
    queueLagSeconds: number;
  },
) {
  const time = nowNanos();
  const traceId = randomHex(16);
  const spanId = randomHex(8);
  const attrs = attributes({ 'signalforge.event': name, ...values });
  const trace = {
    resourceSpans: [
      {
        resource,
        scopeSpans: [
          {
            scope: {
              name: 'signalforge.incident-intelligence',
              version: '1.0.0',
            },
            spans: [
              {
                traceId,
                spanId,
                name,
                kind: 2,
                startTimeUnixNano: time,
                endTimeUnixNano: `${BigInt(time) + BigInt(1_000_000)}`,
                attributes: attrs,
                status: { code: 1 },
              },
            ],
          },
        ],
      },
    ],
  };
  const logs = {
    resourceLogs: [
      {
        resource,
        scopeLogs: [
          {
            scope: { name: 'signalforge.incident-intelligence' },
            logRecords: [
              {
                timeUnixNano: time,
                severityNumber: 9,
                severityText: 'INFO',
                body: { stringValue: name },
                attributes: attrs,
                traceId,
                spanId,
              },
            ],
          },
        ],
      },
    ],
  };
  const metrics = {
    resourceMetrics: [
      {
        resource,
        scopeMetrics: [
          {
            scope: { name: 'signalforge.incident-intelligence' },
            metrics: [
              {
                name: 'signalforge.incident.events',
                description:
                  'Incident intelligence events processed by SignalForge',
                unit: '{event}',
                sum: {
                  aggregationTemporality: 1,
                  isMonotonic: true,
                  dataPoints: [
                    { asInt: '1', timeUnixNano: time, attributes: attrs },
                  ],
                },
              },
              ...(measurements
                ? [
                    {
                      name: 'signalforge.checkout.success_percent',
                      description:
                        'Successful payment checkouts as a percentage',
                      unit: '%',
                      gauge: {
                        dataPoints: [
                          {
                            asDouble: measurements.checkoutSuccessPercent,
                            timeUnixNano: time,
                            attributes: attrs,
                          },
                        ],
                      },
                    },
                    {
                      name: 'signalforge.payment.failure_percent',
                      description: 'Failed payment attempts as a percentage',
                      unit: '%',
                      gauge: {
                        dataPoints: [
                          {
                            asDouble: measurements.paymentFailurePercent,
                            timeUnixNano: time,
                            attributes: attrs,
                          },
                        ],
                      },
                    },
                    {
                      name: 'signalforge.queue.lag_seconds',
                      description: 'Payment queue processing lag',
                      unit: 's',
                      gauge: {
                        dataPoints: [
                          {
                            asDouble: measurements.queueLagSeconds,
                            timeUnixNano: time,
                            attributes: attrs,
                          },
                        ],
                      },
                    },
                  ]
                : []),
            ],
          },
        ],
      },
    ],
  };
  const results = await Promise.allSettled([
    send('/v1/traces', trace),
    send('/v1/logs', logs),
    send('/v1/metrics', metrics),
  ]);
  const rejected = results.filter((result) => result.status === 'rejected');
  if (rejected.length)
    throw new Error('One or more OTel signals were rejected.');
  return { traceId, signals: ['traces', 'logs', 'metrics'] };
}
