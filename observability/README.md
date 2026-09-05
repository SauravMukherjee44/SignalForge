# SignalForge observability pipeline

SignalForge emits OpenTelemetry traces, metrics, and structured incident events to an OpenTelemetry Collector. The Collector enriches the stream with host metrics, derives trace metrics through the Datadog connector, batches each signal type, and exports the result to Datadog.

## Signal path

```text
SignalForge APIs → OTLP/HTTP or OTLP/gRPC → OpenTelemetry Collector
                                              ├─ host metrics
                                              ├─ trace-derived metrics
                                              └─ batched logs, metrics, and traces
                                                        ↓
                                                     Datadog
```

The collector configuration includes OTLP receivers, the `hostmetrics` receiver, a batch processor, the Datadog connector/exporter, and a health endpoint. Credentials are injected at runtime and are intentionally absent from this repository.

## Security boundary

- No Datadog API or application key is committed.
- The collector consumes its API key from the runtime environment.
- Local credential files and generated telemetry output are ignored by Git.
- The application exposes connection health, never secret values.

This directory documents the telemetry topology for reviewers; operational deployment instructions and private environment details are maintained separately.
