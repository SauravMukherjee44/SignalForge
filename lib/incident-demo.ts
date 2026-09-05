import type { VoiceAgentProfile } from '@/lib/voice-agent-profiles';

export type DemoPhase =
  | 'declaration'
  | 'definition'
  | 'impact'
  | 'facts'
  | 'hypothesis'
  | 'contradiction'
  | 'question'
  | 'verification'
  | 'challenge'
  | 'decision'
  | 'status'
  | 'conclusion';

export type DemoLine = {
  speaker: VoiceAgentProfile['id'];
  phase: DemoPhase;
  text: string;
};

export const incidentDemoScript: DemoLine[] = [
  {
    speaker: 'commander',
    phase: 'declaration',
    text: 'Team, we are opening a SEV-1 payment incident. Customers are reporting failed card checkouts. We will separate verified observations from theories, surface contradictions, assign the next checks, and keep every production action behind human approval.',
  },
  {
    speaker: 'support',
    phase: 'definition',
    text: 'Acknowledged. Support has verified failed card checkouts from customers in Singapore and India. We also have two reports from Australia, but we have not verified whether wallets, bank transfers, or regions outside APAC are affected.',
  },
  {
    speaker: 'sre',
    phase: 'facts',
    text: 'Acknowledged. Datadog shows APAC gateway timeouts rising at 10:42 while European and North American success rates remain near baseline. That is a confirmed regional correlation, not proof of root cause.',
  },
  {
    speaker: 'application',
    phase: 'hypothesis',
    text: 'That timing supports a theory that release 4.17 changed retry behavior, but the rollout completed at 10:46. I am treating release causation as a hypothesis until we compare pod versions and request paths.',
  },
  {
    speaker: 'support',
    phase: 'contradiction',
    text: 'I need to challenge that theory. Our earliest verified customer failure is timestamped 10:38, four minutes before the timeout spike and eight minutes before rollout completion. That contradicts the claim that the release initiated the incident.',
  },
  {
    speaker: 'commander',
    phase: 'question',
    text: 'Contradiction recorded. Open question: do the failed requests share one gateway route, one payment method, or one application version? Aarav, compare APAC throttle events with a healthy region. Kabir, check whether both old and new pods show the same failures.',
  },
  {
    speaker: 'sre',
    phase: 'verification',
    text: 'Acknowledged. The read-only comparison is complete. Ninety-two percent of failed requests used gateway route APAC-3, and that route is returning throttle responses. The healthy European route does not show the same pattern.',
  },
  {
    speaker: 'application',
    phase: 'verification',
    text: 'Both old and new application pods fail when traffic uses APAC-3, while both succeed through the healthy route. That evidence weakens the release theory and strengthens regional gateway throttling as the leading hypothesis.',
  },
  {
    speaker: 'support',
    phase: 'question',
    text: 'Customer impact is still active for APAC card payments. An open question remains: are retries causing duplicate authorization holds? Support needs that answer before advising customers to retry checkout.',
  },
  {
    speaker: 'commander',
    phase: 'decision',
    text: 'The safest proposed mitigation is to drain new APAC traffic from route APAC-3 to the healthy gateway. This changes production routing, so it remains pending human approval. Kabir owns the change, Aarav owns recovery telemetry, and Meera owns customer guidance.',
  },
  {
    speaker: 'application',
    phase: 'status',
    text: 'The routing change is prepared but has not executed. If a human approves it, we will watch checkout success, timeout rate, and authorization-hold signals through the verification window before declaring recovery.',
  },
  {
    speaker: 'commander',
    phase: 'conclusion',
    text: 'Final incident summary: APAC card failures and APAC-3 throttling are confirmed. The release theory was contradicted by earlier failures and identical behavior across pod versions. Rerouting remains pending human approval. Recovery, duplicate-authorization risk, and the underlying gateway root cause remain unresolved.',
  },
];
