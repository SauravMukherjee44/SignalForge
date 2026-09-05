const CONFIG_KEYS = [
  'NEXT_PUBLIC_AGORA_APP_ID',
  'AGORA_APP_CERTIFICATE',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GEMINI_LIVE_MODEL',
  'SLACK_BOT_TOKEN',
  'SLACK_CHANNEL_ID',
  'JIRA_BASE_URL',
  'JIRA_EMAIL',
  'JIRA_API_TOKEN',
  'JIRA_PROJECT_KEY',
  'PAGERDUTY_API_TOKEN',
  'PAGERDUTY_INCIDENT_ID',
  'DATADOG_API_KEY',
  'DATADOG_APP_KEY',
  'DATADOG_SITE',
  'DATADOG_CHECKOUT_SUCCESS_QUERY',
  'DATADOG_PAYMENT_FAILURE_QUERY',
  'DATADOG_QUEUE_LAG_QUERY',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
] as const;

export type ConfigKey = (typeof CONFIG_KEYS)[number];

type RuntimeConfigGlobal = typeof globalThis & {
  __signalForgeRuntimeConfig?: Map<ConfigKey, string>;
};

const runtimeGlobal = globalThis as RuntimeConfigGlobal;
const runtimeConfig =
  runtimeGlobal.__signalForgeRuntimeConfig ?? new Map<ConfigKey, string>();
runtimeGlobal.__signalForgeRuntimeConfig = runtimeConfig;

export const isConfigKey = (key: string): key is ConfigKey =>
  CONFIG_KEYS.includes(key as ConfigKey);

export const getConfig = (key: ConfigKey) =>
  runtimeConfig.get(key) ?? process.env[key]?.trim() ?? '';

export const setConfig = (key: ConfigKey, value: string) => {
  const cleanValue = value.trim();
  if (cleanValue) runtimeConfig.set(key, cleanValue);
  else runtimeConfig.delete(key);
};

export const clearConfig = (key: ConfigKey) => runtimeConfig.delete(key);

export const isConfigured = (keys: ConfigKey[]) =>
  keys.every((key) => Boolean(getConfig(key)));

export const publicConfiguration = () => ({
  agoraAppId: getConfig('NEXT_PUBLIC_AGORA_APP_ID'),
  geminiModel: getConfig('GEMINI_MODEL') || 'gemini-3.5-flash-lite',
  datadogSite: getConfig('DATADOG_SITE') || 'datadoghq.com',
  otlpEndpoint:
    getConfig('OTEL_EXPORTER_OTLP_ENDPOINT') || 'http://localhost:4318',
});
