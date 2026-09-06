/* eslint-disable next/no-img-element -- Local SVG brand marks intentionally bypass optimization. */

export type BrandName =
  | 'agora'
  | 'gemini'
  | 'datadog'
  | 'opentelemetry'
  | 'slack'
  | 'jira';

const brandAssets: Record<BrandName, { src: string; label: string }> = {
  agora: { src: '/brand/agora.svg', label: 'Agora' },
  gemini: { src: '/brand/gemini.svg', label: 'Google Gemini' },
  datadog: { src: '/brand/datadog.svg', label: 'Datadog' },
  opentelemetry: {
    src: '/brand/opentelemetry.svg',
    label: 'OpenTelemetry',
  },
  slack: { src: '/brand/slack.svg', label: 'Slack' },
  jira: { src: '/brand/jira.svg', label: 'Jira' },
};

export function BrandIcon({
  brand,
  size = 'md',
  labelled = false,
}: {
  brand: BrandName;
  size?: 'sm' | 'md' | 'lg';
  labelled?: boolean;
}) {
  const asset = brandAssets[brand];
  return (
    <span
      className={`brand-icon brand-icon-${size} brand-${brand}`}
      aria-hidden={labelled ? undefined : true}
    >
      <img src={asset.src} alt={labelled ? asset.label : ''} />
    </span>
  );
}
