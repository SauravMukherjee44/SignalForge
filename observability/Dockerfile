FROM otel/opentelemetry-collector-contrib:0.159.0
COPY otel-collector-config.yaml /etc/otelcol-contrib/config.yaml
COPY railway-overrides.yaml /etc/otelcol-contrib/railway.yaml
CMD ["--config=/etc/otelcol-contrib/config.yaml", "--config=/etc/otelcol-contrib/railway.yaml"]
