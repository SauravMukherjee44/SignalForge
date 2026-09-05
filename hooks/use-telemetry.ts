'use client';

import { useEffect, useState } from 'react';

export type LiveTelemetry = {
  source: 'datadog';
  checkoutSuccess: number | null;
  paymentFailures: number | null;
  queueLagSeconds: number | null;
  observedAt: string;
};

export type LiveDatadogLog = {
  id: string;
  timestamp: string;
  message: string;
  status: string;
  service: string;
  attributes: Record<string, unknown>;
};

export function useTelemetry() {
  const [telemetry, setTelemetry] = useState<LiveTelemetry | null>(null);
  const [samples, setSamples] = useState<LiveTelemetry[]>([]);
  const [logs, setLogs] = useState<LiveDatadogLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'connecting' | 'live' | 'unavailable'>(
    'connecting',
  );
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const [response, logsResponse] = await Promise.all([
          fetch('/api/telemetry', { cache: 'no-store' }),
          fetch('/api/telemetry/logs', { cache: 'no-store' }),
        ]);
        const result = (await response.json()) as
          | LiveTelemetry
          | { source: 'unavailable'; error?: string };
        const logResult = (await logsResponse.json()) as {
          logs?: LiveDatadogLog[];
          error?: string;
        };
        if (active && logsResponse.ok) setLogs(logResult.logs ?? []);
        if (active && response.ok && result.source === 'datadog') {
          setTelemetry(result);
          setSamples((current) => [...current.slice(-39), result]);
          setStatus('live');
          setError(logResult.error ?? null);
        } else if (active) {
          setStatus('unavailable');
          setError('error' in result ? (result.error ?? null) : null);
        }
      } catch (cause) {
        if (active) {
          setStatus('unavailable');
          setError(cause instanceof Error ? cause.message : 'Telemetry request failed.');
        }
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);
  return { telemetry, samples, logs, status, error };
}
