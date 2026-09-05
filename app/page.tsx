'use client';

import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bell,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Command,
  ExternalLink,
  FileClock,
  Files,
  Gauge,
  GitBranch,
  Headphones,
  Lightbulb,
  Link2,
  LogIn,
  LogOut,
  MessageSquareText,
  Mic,
  MicOff,
  Network,
  Pause,
  Play,
  Radio,
  RadioTower,
  RefreshCw,
  Send,
  ShieldCheck,
  SkipForward,
  Sparkles,
  Square,
  Target,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useAgoraRoom,
  type IncidentStreamMessage,
} from '@/hooks/use-agora-room';
import { useLiveTranscription } from '@/hooks/use-live-transcription';
import { useTelemetry, type LiveDatadogLog } from '@/hooks/use-telemetry';
import {
  IntegrationVault,
  type ConfigProvider,
} from '@/components/integration-vault';
import {
  voiceAgentProfiles,
  type VoiceAgentProfile,
} from '@/lib/voice-agent-profiles';
import type { DemoLine, DemoPhase } from '@/lib/incident-demo';

type View =
  | 'command'
  | 'evidence'
  | 'timeline'
  | 'missions'
  | 'recommendations'
  | 'logs'
  | 'integrations';
type Category =
  | 'fact'
  | 'hypothesis'
  | 'decision'
  | 'action'
  | 'conflict'
  | 'question';
type Insight = {
  id: string;
  messageId: string;
  speaker: string;
  sentAt: string;
  transcript: string;
  category: Category;
  confidence: number;
  normalizedClaim: string;
  missingEvidence: string[];
  recommendation: {
    title: string;
    rationale: string;
    ownerRole: string;
    informationGain: number;
    risk: 'low' | 'medium' | 'high';
  };
  engine: 'gemini' | 'local';
};
type Mission = {
  id: string;
  title: string;
  rationale: string;
  owner: string;
  createdAt: string;
  done: boolean;
};
type AgentStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'error';
type DemoStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'paused'
  | 'complete'
  | 'stopping'
  | 'error';

const nav: Array<{ id: View; label: string; icon: typeof Command }> = [
  { id: 'command', label: 'Live command', icon: Command },
  { id: 'evidence', label: 'Evidence graph', icon: GitBranch },
  { id: 'timeline', label: 'Incident pulse', icon: FileClock },
  { id: 'missions', label: 'Response missions', icon: Target },
  { id: 'recommendations', label: 'Next best actions', icon: Lightbulb },
  { id: 'logs', label: 'Signal stream', icon: Files },
  { id: 'integrations', label: 'Connected systems', icon: Link2 },
];
const integrationMeta: Array<{
  key: ConfigProvider;
  name: string;
  detail: string;
  color: string;
}> = [
  {
    key: 'agora',
    name: 'Agora',
    detail: 'RTC audio, identity, speakers, and cloud voice agents',
    color: '#8b7bff',
  },
  {
    key: 'gemini',
    name: 'Gemini',
    detail: 'Live evidence classification and next-best checks',
    color: '#53d6b4',
  },
  {
    key: 'datadog',
    name: 'Datadog',
    detail: 'Current operational metrics',
    color: '#7c4dff',
  },
  {
    key: 'opentelemetry',
    name: 'OpenTelemetry',
    detail: 'Trace, metric, and log delivery',
    color: '#ff8d5c',
  },
  {
    key: 'slack',
    name: 'Slack',
    detail: 'Reviewed, fact-grounded updates',
    color: '#f6b84a',
  },
  {
    key: 'jira',
    name: 'Jira',
    detail: 'Approved owned follow-ups',
    color: '#4da3ff',
  },
];

const namedAvatar = new Map(
  voiceAgentProfiles.map((profile) => [profile.name, profile.avatar - 1]),
);
const avatarIndex = (name: string) =>
  namedAvatar.get(name) ??
  Array.from(name).reduce((n, c) => n + c.charCodeAt(0), 0) % 6;
function Avatar({
  name,
  size = 'md',
  speaking = false,
  ai = false,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  speaking?: boolean;
  ai?: boolean;
}) {
  return (
    <span
      className={`avatar avatar-${avatarIndex(name) + 1} avatar-${size} ${speaking ? 'is-speaking' : ''}`}
      title={name}
    >
      {ai && <Sparkles size={12} className="avatar-ai-mark" />}
    </span>
  );
}
function SignalBars({ active = true }: { active?: boolean }) {
  return (
    <span className={`signal-bars ${active ? 'active' : ''}`} aria-hidden>
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
const clock = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso));
const elapsed = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
function Empty({
  icon: Icon,
  children,
}: {
  icon: typeof Command;
  children: string;
}) {
  return (
    <div className="live-empty">
      <Icon size={25} />
      <p>{children}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  suffix,
  live,
}: {
  label: string;
  value: string;
  suffix?: string;
  live: boolean;
}) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <Activity size={15} />
      </div>
      <div className="metric-value">
        {value}
        {value !== '—' && <small>{suffix}</small>}
      </div>
      <div className="metric-delta good">
        <CircleDot size={12} />
        {live ? 'Current Datadog point' : 'Waiting for source'}
      </div>
    </div>
  );
}

function AgentTeam({
  connected,
  statuses,
  toggle,
  demoStatus,
  demoStep,
  demoTotal,
  startDemo,
  pauseDemo,
  nextDemo,
  stopDemo,
  demoError,
  demoSpeaker,
  demoPhase,
  demoBusy,
}: {
  connected: boolean;
  statuses: Record<string, AgentStatus>;
  toggle: (p: VoiceAgentProfile) => void;
  demoStatus: DemoStatus;
  demoStep: number;
  demoTotal: number;
  startDemo: () => void;
  pauseDemo: () => void;
  nextDemo: () => void;
  stopDemo: () => void;
  demoError: string | null;
  demoSpeaker: string | null;
  demoPhase: DemoPhase | null;
  demoBusy: boolean;
}) {
  const demoActive = ['running', 'paused', 'complete'].includes(demoStatus);
  return (
    <section className="voice-team glass-card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            <Sparkles size={14} /> AGORA CLOUD VOICE TEAM
          </span>
          <h2>Live incident response</h2>
        </div>
        <span className={`voice-team-note demo-${demoStatus}`}>
          {demoStatus === 'running'
            ? `Turn ${Math.max(1, demoStep)} of ${demoTotal}`
            : demoStatus === 'paused'
              ? `Paused after round ${demoStep}`
              : demoStatus === 'complete'
                ? 'Conclusion reached'
                : demoStatus === 'starting'
                  ? 'Assembling responders…'
                  : 'Observer-controlled'}
        </span>
      </div>
      <div className="demo-director">
        <div className="demo-copy">
          <span className="demo-live-dot" />
          <div>
            <b>
              {demoSpeaker && demoPhase
                ? `${demoSpeaker} has the floor · ${demoPhase}`
                : 'Response director'}
            </b>
            <p>
              One voice at a time. Each responder acknowledges the previous turn
              before advancing the incident. Pause or intervene through Ira at
              any time.
            </p>
          </div>
        </div>
        <div className="demo-progress" aria-label="Response progress">
          {Array.from({ length: demoTotal }, (_, index) => (
            <i className={index < demoStep ? 'complete' : ''} key={index} />
          ))}
        </div>
        <div className="demo-controls">
          {!demoActive ? (
            <button
              className="demo-primary"
              disabled={!connected || demoStatus === 'starting'}
              onClick={startDemo}
            >
              {demoStatus === 'starting' ? (
                <RefreshCw size={16} className="spin" />
              ) : (
                <Play size={16} />
              )}
              {demoStatus === 'starting'
                ? 'Starting…'
                : 'Bring responders online'}
            </button>
          ) : (
            <>
              <button
                onClick={pauseDemo}
                disabled={demoStatus === 'complete' || demoBusy}
              >
                {demoStatus === 'paused' ? (
                  <Play size={16} />
                ) : (
                  <Pause size={16} />
                )}
                {demoStatus === 'paused' ? 'Resume' : 'Pause'}
              </button>
              <button
                onClick={nextDemo}
                disabled={demoStatus === 'complete' || demoBusy}
              >
                <SkipForward size={16} /> Next voice
              </button>
              <button onClick={stopDemo}>
                <Square size={15} /> End response
              </button>
            </>
          )}
        </div>
        {demoError && <p className="demo-error">{demoError}</p>}
      </div>
      <div className="voice-agent-grid">
        {voiceAgentProfiles.map((p) => {
          const status = statuses[p.id] ?? 'idle';
          const busy = status === 'starting' || status === 'stopping';
          return (
            <article className="voice-agent" key={p.id}>
              <Avatar name={p.name} ai />
              <div>
                <b>
                  {p.name}
                  <small className="agent-gender">{p.gender}</small>
                </b>
                <span>{p.role}</span>
                <small>{p.specialty}</small>
              </div>
              <button
                className={status === 'running' ? 'agent-stop' : 'agent-invite'}
                disabled={!connected || busy || demoActive}
                onClick={() => toggle(p)}
              >
                {busy ? (
                  <RefreshCw size={15} className="spin" />
                ) : status === 'running' ? (
                  <X size={15} />
                ) : (
                  <LogIn size={15} />
                )}
                {status === 'starting'
                  ? 'Joining…'
                  : status === 'stopping'
                    ? 'Leaving…'
                    : status === 'running'
                      ? 'Remove'
                      : status === 'error'
                        ? 'Retry'
                        : `Invite ${p.name}`}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function LiveLogs({
  logs,
  status,
  error,
}: {
  logs: LiveDatadogLog[];
  status: 'connecting' | 'live' | 'unavailable';
  error: string | null;
}) {
  return (
    <div className="detail-view view-enter">
      <DetailHeader
        icon={Files}
        eyebrow="OPERATIONAL SIGNAL STREAM"
        title="What the systems are saying"
        copy="Live OpenTelemetry events from Datadog, ordered for rapid incident review."
      />
      <section className="log-stream glass-card">
        <div className="log-stream-head">
          <span className={`telemetry-source ${status}`}>
            <Activity size={14} />
            {status === 'live' ? 'Datadog connected' : status === 'connecting' ? 'Connecting…' : 'Unavailable'}
          </span>
          <small>{logs.length} events in the last 30 minutes</small>
        </div>
        {error && <p className="log-stream-error">{error}</p>}
        {logs.length ? (
          <div className="log-list">
            {logs.map((entry) => (
              <article key={entry.id}>
                <time>{clock(entry.timestamp)}</time>
                <span className={`log-level ${entry.status.toLowerCase()}`}>{entry.status}</span>
                <div>
                  <b>{entry.message}</b>
                  <small>{entry.service}</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty icon={Files}>
            No SignalForge logs arrived in the last 30 minutes. Join the room and speak to produce the first live event.
          </Empty>
        )}
      </section>
    </div>
  );
}

function CommandLogSignals({
  logs,
  status,
  openAll,
}: {
  logs: LiveDatadogLog[];
  status: 'connecting' | 'live' | 'unavailable';
  openAll: () => void;
}) {
  const recent = logs.slice(0, 4);
  return (
    <section className="command-log-signals glass-card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">LIVE DATADOG EVENTS</span>
          <h2>Current log signals</h2>
        </div>
        <button className="log-view-all" onClick={openAll}>
          View all {logs.length} events <ChevronRight size={15} />
        </button>
      </div>
      {recent.length ? (
        <div className="command-log-list">
          {recent.map((entry) => (
            <article key={entry.id}>
              <span className={`log-level ${entry.status.toLowerCase()}`}>
                {entry.status}
              </span>
              <div>
                <b>{entry.message}</b>
                <small>
                  {entry.service} · {clock(entry.timestamp)}
                </small>
              </div>
              <Activity size={15} />
            </article>
          ))}
        </div>
      ) : (
        <div className="command-log-empty">
          <Activity size={18} />
          <span>
            {status === 'connecting'
              ? 'Connecting to the Datadog log stream…'
              : 'No log events received in the current window.'}
          </span>
        </div>
      )}
    </section>
  );
}

function DetailHeader({
  icon: Icon,
  eyebrow,
  title,
  copy,
}: {
  icon: typeof Command;
  eyebrow: string;
  title: string;
  copy: string;
}) {
  return (
    <div className="detail-title">
      <div>
        <span className="eyebrow">
          <Icon size={15} /> {eyebrow}
        </span>
        <h2>{title}</h2>
        <p>{copy}</p>
      </div>
    </div>
  );
}

function Evidence({ insights }: { insights: Insight[] }) {
  const groups = (
    [
      'fact',
      'hypothesis',
      'conflict',
      'decision',
      'action',
      'question',
    ] as Category[]
  )
    .map((category) => ({
      category,
      items: insights.filter((i) => i.category === category),
    }))
    .filter((g) => g.items.length);
  return (
    <div className="detail-view view-enter">
      <DetailHeader
        icon={GitBranch}
        eyebrow="EVIDENCE GRAPH"
        title="Every claim keeps its source"
        copy="SignalForge links each live statement to its speaker, confidence, and evidence state."
      />
      {groups.length ? (
        <div className="dynamic-ledger">
          {groups.map((g) => (
            <section className="ledger-group glass-card" key={g.category}>
              <div className="ledger-title">
                <span className={`claim-badge ${g.category}`}>
                  {g.category}
                </span>
                <b>{g.items.length}</b>
              </div>
              {g.items.map((i) => (
                <article key={i.id}>
                  <Avatar name={i.speaker} size="sm" />
                  <div>
                    <b>{i.normalizedClaim}</b>
                    <small>
                      {i.speaker} · {clock(i.sentAt)} ·{' '}
                      {Math.round(i.confidence * 100)}%
                    </small>
                  </div>
                </article>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <Empty icon={GitBranch}>
          Join the room and speak to create the first evidence claim.
        </Empty>
      )}
    </div>
  );
}

function Timeline({
  messages,
  insights,
}: {
  messages: IncidentStreamMessage[];
  insights: Insight[];
}) {
  return (
    <div className="detail-view view-enter">
      <DetailHeader
        icon={FileClock}
        eyebrow="INCIDENT PULSE"
        title="The room, reconstructed in order"
        copy="Speaker, statement, classification, and arrival time stay connected as the incident evolves."
      />
      <section className="timeline-card glass-card">
        {messages.length ? (
          <div className="timeline-axis">
            {messages.map((m) => {
              const i = insights.find((x) => x.messageId === m.id);
              return (
                <article
                  className={`timeline-entry ${i?.category ?? ''}`}
                  key={m.id}
                >
                  <div className="timeline-time">
                    <b>{clock(m.sentAt)}</b>
                    <span>{m.speaker}</span>
                  </div>
                  <span className="timeline-dot">
                    <CircleDot size={15} />
                  </span>
                  <div>
                    <h3>{i?.category ?? 'processing'}</h3>
                    <p>{m.text}</p>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty icon={FileClock}>
            Timeline entries arrive automatically with room statements.
          </Empty>
        )}
      </section>
    </div>
  );
}

function Missions({
  missions,
  toggle,
}: {
  missions: Mission[];
  toggle: (id: string) => void;
}) {
  return (
    <div className="detail-view view-enter">
      <DetailHeader
        icon={Target}
        eyebrow="RESPONSE MISSIONS"
        title="Every accepted move has an owner"
        copy="Approved recommendations become accountable work with a visible completion state."
      />
      {missions.length ? (
        <div className="mission-grid">
          {missions.map((m, n) => (
            <article
              className={`mission-card glass-card ${m.done ? 'done' : ''}`}
              key={m.id}
            >
              <div className="mission-top">
                <span className="mission-number">
                  {String(n + 1).padStart(2, '0')}
                </span>
                <button className="mission-status" onClick={() => toggle(m.id)}>
                  {m.done ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}
                  {m.done ? 'done' : 'open'}
                </button>
              </div>
              <h3>{m.title}</h3>
              <p>{m.rationale}</p>
              <div className="mission-owner">
                <Avatar name={m.owner} size="sm" />
                <div>
                  <small>Suggested owner</small>
                  <b>{m.owner}</b>
                </div>
                <span>{clock(m.createdAt)}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty icon={Target}>
          Accept a live recommendation to create the first mission.
        </Empty>
      )}
    </div>
  );
}

function Recommendations({
  insights,
  missions,
  accept,
}: {
  insights: Insight[];
  missions: Mission[];
  accept: (i: Insight) => void;
}) {
  const ordered = [...insights].sort(
    (a, b) =>
      b.recommendation.informationGain - a.recommendation.informationGain,
  );
  return (
    <div className="detail-view recommendation-view view-enter">
      <DetailHeader
        icon={Lightbulb}
        eyebrow="LIVE RECOMMENDATIONS"
        title="Next moves derived from current evidence"
        copy="Ranked by information gain; execution remains human-controlled."
      />
      {ordered.length ? (
        <section className="recommendation-list">
          {ordered.map((i, n) => {
            const accepted = missions.some((m) => m.id === i.id);
            return (
              <article
                className={`recommendation-card glass-card ${accepted ? 'accepted' : ''}`}
                key={i.id}
              >
                <div className="recommendation-rank">
                  <span>#{n + 1}</span>
                  <i
                    style={{
                      height: `${Math.max(35, i.recommendation.informationGain)}%`,
                    }}
                  />
                </div>
                <div className="recommendation-main">
                  <div className="recommendation-card-top">
                    <span className={`recommendation-kind kind-${i.category}`}>
                      {i.category}
                    </span>
                    <span className="recommendation-confidence">
                      {i.recommendation.informationGain}% information gain
                    </span>
                  </div>
                  <h3>{i.recommendation.title}</h3>
                  <p>{i.recommendation.rationale}</p>
                  <div className="recommendation-evidence">
                    <b>Evidence used</b>
                    <span>
                      <CheckCircle2 size={15} />
                      {i.normalizedClaim}
                    </span>
                    {i.missingEvidence.map((g) => (
                      <span key={g}>
                        <AlertTriangle size={15} />
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
                <aside className="recommendation-scorecard">
                  <div>
                    <span>Confidence</span>
                    <b>{Math.round(i.confidence * 100)}</b>
                    <i>
                      <em style={{ width: `${i.confidence * 100}%` }} />
                    </i>
                  </div>
                  <div className="recommendation-owner">
                    <Avatar name={i.recommendation.ownerRole} size="sm" />
                    <span>
                      <small>Suggested owner</small>
                      <b>{i.recommendation.ownerRole}</b>
                    </span>
                  </div>
                  <button
                    className={accepted ? 'accepted-btn' : 'accept-btn'}
                    disabled={accepted}
                    onClick={() => accept(i)}
                  >
                    {accepted ? (
                      <>
                        <CheckCircle2 size={17} />
                        Accepted
                      </>
                    ) : (
                      <>
                        <Target size={17} />
                        Accept as mission
                      </>
                    )}
                  </button>
                </aside>
              </article>
            );
          })}
        </section>
      ) : (
        <Empty icon={Lightbulb}>
          Recommendations appear only after live evidence is analyzed.
        </Empty>
      )}
    </div>
  );
}

function Integrations({
  insights,
  messages,
  missions,
}: {
  insights: Insight[];
  messages: IncidentStreamMessage[];
  missions: Mission[];
}) {
  type StatusMap = Record<
    string,
    { configured: boolean; secure?: boolean; connected?: boolean }
  >;
  type Provider = 'slack' | 'jira';
  type PublishView = 'status' | 'conversation' | 'conclusion';
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [config, setConfig] = useState<ConfigProvider>('agora');
  const [provider, setProvider] = useState<Provider>('slack');
  const [publishView, setPublishView] = useState<PublishView>('status');
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState('');
  const facts = insights.filter((item) => item.category === 'fact');
  const decisions = insights.filter((item) => item.category === 'decision');
  const unresolved = missions.filter((item) => !item.done);
  const drafts: Record<PublishView, string> = {
    status: [
      '*SignalForge live incident update*',
      facts.length
        ? facts.map((fact) => `• ${fact.normalizedClaim}`).join('\n')
        : '_No facts have been confirmed yet._',
      unresolved.length
        ? `\n*Open missions*\n${unresolved.map((item) => `• ${item.title} — ${item.owner}`).join('\n')}`
        : '',
    ].join('\n'),
    conversation: [
      '*SignalForge reviewed conversation*',
      ...messages
        .filter((item) => item.kind === 'transcript' && item.text)
        .slice(-20)
        .map((item) => `• *${item.speaker}:* ${item.text}`),
    ].join('\n'),
    conclusion: [
      '*SignalForge incident conclusion*',
      `*Confirmed facts*\n${facts.map((item) => `• ${item.normalizedClaim}`).join('\n') || '• None confirmed'}`,
      `*Decisions*\n${decisions.map((item) => `• ${item.normalizedClaim}`).join('\n') || '• None recorded'}`,
      `*Unresolved risks and owners*\n${unresolved.map((item) => `• ${item.title} — ${item.owner}`).join('\n') || '• None open'}`,
    ].join('\n\n'),
  };
  const draft = drafts[publishView];
  const [message, setMessage] = useState<string | null>(null);
  const refresh = useCallback(() => {
    void fetch('/api/integrations/status')
      .then(async (r) => (await r.json()) as StatusMap)
      .then(setStatuses)
      .catch(() => undefined);
  }, []);
  useEffect(() => refresh(), [refresh]);
  const run = async () => {
    setSending(true);
    setResult('');
    try {
      const r = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          confirmed,
          title: `SignalForge ${publishView}`,
          message: message ?? draft,
        }),
      });
      const body = (await r.json()) as {
        status?: string;
        reference?: string;
        error?: string;
        missing?: string[];
      };
      setResult(
        r.ok
          ? `${provider} action ${body.status}. ${body.reference ?? ''}`
          : body.missing?.length
            ? `Configuration required: ${body.missing.join(', ')}`
            : (body.error ?? 'Action failed.'),
      );
      if (r.ok) setConfirmed(false);
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="detail-view view-enter">
      <DetailHeader
        icon={Link2}
        eyebrow="CONNECTED SYSTEMS"
        title="Your incident stack, in one control plane"
        copy="Connection states come from the running services, and external writes stay human-approved."
      />
      <div className="integration-grid">
        {integrationMeta.map((item) => {
          const s = statuses[item.key];
          const ok =
            item.key === 'opentelemetry'
              ? Boolean(s?.connected)
              : Boolean(s?.configured);
          const label =
            item.key === 'agora' && s?.configured && !s.secure
              ? 'Needs certificate'
              : item.key === 'opentelemetry'
                ? s?.connected
                  ? 'Collector live'
                  : 'Collector offline'
                : ok
                  ? 'Configured'
                  : 'Not configured';
          return (
            <article className="integration-card glass-card" key={item.key}>
              <span
                className="integration-logo"
                style={
                  { '--integration-color': item.color } as React.CSSProperties
                }
              >
                {item.name.slice(0, 2)}
              </span>
              <div>
                <h3>{item.name}</h3>
                <p>{item.detail}</p>
              </div>
              <span
                className={
                  ok ? 'integration-status' : 'integration-status missing'
                }
              >
                <i />
                {label}
              </span>
              <button
                className="integration-arrow"
                onClick={() => setConfig(item.key)}
              >
                <ArrowUpRight size={17} />
              </button>
            </article>
          );
        })}
      </div>
      <IntegrationVault
        key={config}
        provider={config}
        onProviderChange={setConfig}
        onSaved={refresh}
      />
      <section className="action-console glass-card">
        <div className="action-console-copy">
          <span className="eyebrow">
            <Send size={15} /> HUMAN-CONFIRMED ACTIONS
          </span>
          <h2>Publish the incident narrative to Slack</h2>
          <p>Choose the reviewed view the team needs. Nothing is sent without explicit approval.</p>
          <div className="provider-switcher">
            {(['slack', 'jira'] as const).map((p) => (
              <button
                className={provider === p ? 'active' : ''}
                key={p}
                onClick={() => setProvider(p)}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="provider-switcher">
            {(['status', 'conversation', 'conclusion'] as const).map((view) => (
              <button
                className={publishView === view ? 'active' : ''}
                key={view}
                onClick={() => {
                  setPublishView(view);
                  setMessage(null);
                  setConfirmed(false);
                }}
              >
                {view}
              </button>
            ))}
          </div>
        </div>
        <div className="action-composer">
          <label>
            <span>Prepared {publishView} payload for {provider}</span>
            <textarea
              value={message ?? draft}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Live incident intelligence will appear here"
            />
          </label>
          <label className="action-confirmation">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              I reviewed this payload and authorize the external write.
            </span>
          </label>
          <button
            className="execute-action-btn"
            onClick={() => void run()}
            disabled={!confirmed || sending || !(message ?? draft).trim()}
          >
            <ShieldCheck size={18} />
            Execute confirmed action
          </button>
          {result && <p className="action-result">{result}</p>}
        </div>
      </section>
    </div>
  );
}

export default function Home() {
  const [appId, setAppId] = useState(
    process.env.NEXT_PUBLIC_AGORA_APP_ID ?? '',
  );
  const [identity, setIdentity] = useState({
    name: '',
    role: 'Incident observer',
  });
  const [title, setTitle] = useState('Live operational incident');
  const [severity, setSeverity] = useState('SEV-1');
  const [view, setView] = useState<View>('command');
  const [manual, setManual] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [agentCaption, setAgentCaption] = useState<{
    speaker: string;
    text: string;
    phase: DemoPhase;
  } | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [agents, setAgents] = useState<Record<string, AgentStatus>>({});
  const [demoStatus, setDemoStatus] = useState<DemoStatus>('idle');
  const [demoStep, setDemoStep] = useState(0);
  const [demoTotal, setDemoTotal] = useState(9);
  const [demoDelay, setDemoDelay] = useState(1_200);
  const [demoSpeaker, setDemoSpeaker] = useState<string | null>(null);
  const [demoPhase, setDemoPhase] = useState<DemoPhase | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [started, setStarted] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const processed = useRef(new Set<string>());
  const demoAdvancing = useRef(false);
  const autoStartDemo = useRef(false);
  const captionInterval = useRef<number | null>(null);
  const captionCommitTimer = useRef<number | null>(null);
  const captionClearTimer = useRef<number | null>(null);
  const telemetry = useTelemetry();
  const room = useAgoraRoom(appId, identity);
  useEffect(() => {
    void fetch('/api/settings')
      .then(async (r) => (await r.json()) as { agoraAppId?: string })
      .then((s) => s.agoraAppId && setAppId(s.agoraAppId))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (started === null) return;
    const tick = () => setSeconds(Math.floor((Date.now() - started) / 1000));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [started]);
  useEffect(() => {
    room.messages.forEach((m) => {
      if (!m.text || processed.current.has(m.id)) return;
      processed.current.add(m.id);
      void (async () => {
        setAnalyzing(true);
        try {
          const r = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              speaker: m.speaker,
              transcript: m.text,
              context: title,
            }),
          });
          if (!r.ok) return;
          const data = (await r.json()) as Omit<
            Insight,
            'id' | 'messageId' | 'speaker' | 'sentAt' | 'transcript'
          >;
          setInsights((current) =>
            [
              ...current,
              {
                ...data,
                id: crypto.randomUUID(),
                messageId: m.id,
                speaker: m.speaker,
                sentAt: m.sentAt,
                transcript: m.text!,
              },
            ].slice(-80),
          );
        } finally {
          setAnalyzing(false);
        }
      })();
    });
  }, [room.messages, title]);
  const speech = useLiveTranscription(async (text) => {
    setFinalTranscript(text);
    await room.sendTranscript(identity.name.trim() || 'Observer', text);
    window.setTimeout(
      () => setFinalTranscript((current) => (current === text ? '' : current)),
      2_800,
    );
    if (['running', 'paused'].includes(demoStatus)) {
      setDemoStatus('paused');
      await fetch('/api/voice-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'intervene',
          channel: room.channel,
          text,
        }),
      });
    }
  });
  const agentChannel = room.channel;
  const ingestAgentTranscript = room.ingestTranscript;
  const clearCaptionTimers = useCallback(() => {
    if (captionInterval.current !== null)
      window.clearInterval(captionInterval.current);
    if (captionCommitTimer.current !== null)
      window.clearTimeout(captionCommitTimer.current);
    if (captionClearTimer.current !== null)
      window.clearTimeout(captionClearTimer.current);
    captionInterval.current = null;
    captionCommitTimer.current = null;
    captionClearTimer.current = null;
  }, []);

  useEffect(() => () => clearCaptionTimers(), [clearCaptionTimers]);

  const nextDemoLine = useCallback(async () => {
    if (demoAdvancing.current) return;
    demoAdvancing.current = true;
    setDemoBusy(true);
    try {
      const response = await fetch('/api/voice-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'demo-next', channel: agentChannel }),
      });
      const payload = (await response.json()) as {
        line?: DemoLine | null;
        index?: number;
        total?: number;
        completed?: boolean;
        durationMs?: number;
        waitMs?: number;
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error || 'Response turn failed.');
      if (payload.line) {
        const profile = voiceAgentProfiles.find(
          (candidate) => candidate.id === payload.line?.speaker,
        );
        if (profile) {
          clearCaptionTimers();
          setDemoSpeaker(profile.name);
          setDemoPhase(payload.line.phase);
          const spokenLine = payload.line;
          const words = spokenLine.text.split(/\s+/);
          const durationMs = Math.max(1_600, payload.durationMs ?? 1_600);
          let visibleWords = 0;
          setAgentCaption({
            speaker: profile.name,
            text: '',
            phase: spokenLine.phase,
          });
          captionInterval.current = window.setInterval(() => {
            visibleWords = Math.min(words.length, visibleWords + 1);
            setAgentCaption({
              speaker: profile.name,
              text: words.slice(0, visibleWords).join(' '),
              phase: spokenLine.phase,
            });
            if (
              visibleWords >= words.length &&
              captionInterval.current !== null
            ) {
              window.clearInterval(captionInterval.current);
              captionInterval.current = null;
            }
          }, Math.max(90, Math.floor((durationMs - 450) / words.length)));
          captionCommitTimer.current = window.setTimeout(() => {
            if (captionInterval.current !== null) {
              window.clearInterval(captionInterval.current);
              captionInterval.current = null;
            }
            setAgentCaption({
              speaker: profile.name,
              text: spokenLine.text,
              phase: spokenLine.phase,
            });
            ingestAgentTranscript({
              id: `guided-demo-${agentChannel}-${payload.index}-${profile.id}`,
              kind: 'transcript',
              speaker: profile.name,
              text: spokenLine.text,
              uid: profile.uid,
              sentAt: new Date().toISOString(),
            });
            captionClearTimer.current = window.setTimeout(
              () => setAgentCaption(null),
              900,
            );
            if (payload.completed) setDemoStatus('complete');
          }, durationMs);
        }
      }
      setDemoStep(payload.index ?? 0);
      setDemoTotal(payload.total ?? 9);
      setDemoDelay(
        Math.max(900, payload.durationMs ?? payload.waitMs ?? 1_200) + 600,
      );
    } catch (error) {
      setDemoError(
        error instanceof Error ? error.message : 'The response turn failed.',
      );
      setDemoStatus('error');
    } finally {
      demoAdvancing.current = false;
      setDemoBusy(false);
    }
  }, [agentChannel, clearCaptionTimers, ingestAgentTranscript]);

  const startDemo = useCallback(async () => {
    if (room.uid == null) return;
    setDemoStatus('starting');
    setDemoError(null);
    setDemoStep(0);
    setDemoDelay(1_200);
    setDemoSpeaker(null);
    setDemoPhase(null);
    try {
      const response = await fetch('/api/voice-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'demo-start',
          channel: agentChannel,
          requesterUid: String(room.uid),
        }),
      });
      const payload = (await response.json()) as {
        demo?: { total?: number };
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error || 'Response team start failed.');
      setDemoTotal(payload.demo?.total ?? 9);
      setAgents(
        Object.fromEntries(
          voiceAgentProfiles.map((profile) => [profile.id, 'running']),
        ),
      );
      setDemoStatus('running');
    } catch (error) {
      setDemoError(
        error instanceof Error
          ? error.message
          : 'The voice team could not join.',
      );
      setDemoStatus('error');
    }
  }, [agentChannel, room.uid]);

  useEffect(() => {
    if (
      room.state !== 'connected' ||
      room.uid == null ||
      !autoStartDemo.current
    )
      return;
    autoStartDemo.current = false;
    void startDemo();
  }, [room.state, room.uid, startDemo]);

  const stopDemo = async () => {
    setDemoStatus('stopping');
    clearCaptionTimers();
    setAgentCaption(null);
    try {
      await fetch('/api/voice-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'demo-stop', channel: agentChannel }),
      });
    } finally {
      setAgents(
        Object.fromEntries(
          voiceAgentProfiles.map((profile) => [profile.id, 'idle']),
        ),
      );
      setDemoStatus('idle');
      setDemoStep(0);
      setDemoSpeaker(null);
      setDemoPhase(null);
      setDemoError(null);
    }
  };

  useEffect(() => {
    if (demoStatus === 'idle') return;
    const stopOnPageExit = () => {
      const payload = new Blob(
        [JSON.stringify({ action: 'demo-stop', channel: agentChannel })],
        { type: 'application/json' },
      );
      navigator.sendBeacon('/api/voice-agents', payload);
    };
    window.addEventListener('pagehide', stopOnPageExit);
    return () => window.removeEventListener('pagehide', stopOnPageExit);
  }, [agentChannel, demoStatus]);

  const leaveRoom = async () => {
    if (demoStatus !== 'idle') await stopDemo();
    await room.leave();
  };

  useEffect(() => {
    if (demoStatus !== 'running') return;
    const timer = window.setTimeout(
      () => void nextDemoLine(),
      demoStep === 0 ? 1_200 : demoDelay,
    );
    return () => window.clearTimeout(timer);
  }, [demoDelay, demoStatus, demoStep, nextDemoLine]);
  useEffect(() => {
    if (
      !Object.values(agents).includes('running') ||
      demoStatus !== 'idle'
    )
      return;
    let active = true;
    const refreshAgentHistory = async () => {
      try {
        const response = await fetch(
          `/api/voice-agents?channel=${encodeURIComponent(agentChannel)}`,
        );
        const payload = (await response.json()) as {
          history?: Array<{
            agentId: string;
            name: string;
            uid: string;
            startedAt: string;
            contents: Array<{ role?: string; content?: string }>;
          }>;
        };
        if (!active) return;
        payload.history?.forEach((agent) =>
          agent.contents.forEach((turn, index) => {
            if (turn.role !== 'assistant' || !turn.content?.trim()) return;
            ingestAgentTranscript({
              id: `${agent.agentId}-assistant-${index}`,
              kind: 'transcript',
              speaker: agent.name,
              text: turn.content.trim(),
              uid: agent.uid,
              sentAt: new Date(
                new Date(agent.startedAt).getTime() + index * 1000,
              ).toISOString(),
            });
          }),
        );
      } catch {
        // RTC audio remains live if optional history polling is interrupted.
      }
    };
    void refreshAgentHistory();
    const timer = window.setInterval(() => void refreshAgentHistory(), 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [agentChannel, agents, demoStatus, ingestAgentTranscript]);
  const submit = () => {
    const text = manual.trim();
    if (!text) return;
    setManual('');
    void room.sendTranscript(identity.name.trim() || 'Observer', text);
    if (['running', 'paused'].includes(demoStatus)) {
      setDemoStatus('paused');
      void fetch('/api/voice-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'intervene',
          channel: agentChannel,
          text,
        }),
      });
    }
  };
  const toggleAgent = async (p: VoiceAgentProfile) => {
    const action = agents[p.id] === 'running' ? 'stop' : 'start';
    setAgents((s) =>
      Object.fromEntries(
        voiceAgentProfiles.map((profile) => [
          profile.id,
          profile.id === p.id
            ? action === 'start'
              ? 'starting'
              : 'stopping'
            : (s[profile.id] ?? 'idle'),
        ]),
      ),
    );
    try {
      const r = await fetch('/api/voice-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          profileId: p.id,
          channel: room.channel,
          requesterUid: room.uid == null ? undefined : String(room.uid),
        }),
      });
      if (!r.ok) throw new Error();
      setAgents((current) => ({
        ...current,
        [p.id]: action === 'start' ? 'running' : 'idle',
      }));
    } catch {
      setAgents((s) => ({ ...s, [p.id]: 'error' }));
    }
  };
  const accept = (i: Insight) =>
    setMissions((current) =>
      current.some((m) => m.id === i.id)
        ? current
        : [
            ...current,
            {
              id: i.id,
              title: i.recommendation.title,
              rationale: i.recommendation.rationale,
              owner: i.recommendation.ownerRole,
              createdAt: new Date().toISOString(),
              done: false,
            },
          ],
    );
  const counts: Partial<Record<View, number>> = {
    evidence: insights.length,
    timeline: room.messages.length,
    missions: missions.filter((m) => !m.done).length,
    recommendations: insights.length,
    logs: telemetry.logs.length,
  };
  const facts = insights.filter((i) => i.category === 'fact');
  const latest = insights.at(-1);
  const t = telemetry.telemetry;
  const participants = room.participants.map((p) => {
    const agent = voiceAgentProfiles.find((a) => a.uid === String(p.uid));
    return agent
      ? { ...p, name: agent.name, role: agent.role, ai: true }
      : { ...p, ai: false };
  });
  const stage = facts.length
    ? t?.checkoutSuccess != null && t.checkoutSuccess >= 98
      ? 'Monitoring'
      : 'Investigating'
    : 'Listening';

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <aside className="sidebar glass-panel">
        <div className="brand">
          <span className="brand-mark">
            <img src="/visuals/signalforge-core.png" alt="" />
          </span>
          <span>
            <b>SignalForge</b>
            <small>INCIDENT INTELLIGENCE</small>
          </span>
        </div>
        <div className="workspace-switcher">
          <span>SF</span>
          <div>
            <small>WORKSPACE</small>
            <b>Live operations</b>
          </div>
          <ChevronRight size={15} />
        </div>
        <nav>
          <p className="nav-label">CURRENT ROOM</p>
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? 'nav-item active' : 'nav-item'}
                onClick={() => setView(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {counts[item.id] != null && <em>{counts[item.id]}</em>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-spacer" />
        <a
          className="architecture-link"
          href="https://signalforge-architecture.netlify.app/"
          target="_blank"
          rel="noreferrer"
        >
          <Network size={17} />
          <span>System architecture</span>
          <ExternalLink size={13} />
        </a>
        <div className="system-health">
          <span className={`health-dot ${telemetry.status}`} />
          <div>
            <b>
              {room.state === 'connected'
                ? 'Room connected'
                : 'Room not joined'}
            </b>
            <small>
              {telemetry.status === 'live'
                ? 'Datadog streaming'
                : 'Waiting for telemetry'}
            </small>
          </div>
          <ShieldCheck size={17} />
        </div>
        <div className="profile">
          <Avatar name={identity.name || 'Responder'} size="sm" />
          <div>
            <b>{identity.name || 'Your identity'}</b>
            <small>{identity.role}</small>
          </div>
          <Bell size={16} />
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Agora room</span>
            <ChevronRight size={14} />
            <b>{room.channel}</b>
          </div>
          <div className="topbar-actions">
            <span className={`live-pill ${room.state}`}>
              <Radio size={14} />
              {room.state === 'connected' ? 'Live' : 'Offline'}
              <SignalBars active={room.state === 'connected'} />
            </span>
          </div>
        </header>
        <div className="incident-header">
          <div className="incident-heading-copy">
            <div className="incident-title-row">
              <select
                className="severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
              >
                <option>SEV-1</option>
                <option>SEV-2</option>
                <option>SEV-3</option>
              </select>
              <input
                className="incident-title-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <span className={`stage stage-${stage.toLowerCase()}`}>
                {stage}
              </span>
            </div>
            <p>Live state only · no preloaded incident narrative</p>
            <div className="incident-meta">
              <span>
                <Clock3 size={14} />
                {elapsed(seconds)} elapsed
              </span>
              <span>
                <Users size={14} />
                {participants.length} participants
              </span>
              <span>
                <Gauge size={14} />
                {telemetry.samples.length} telemetry samples
              </span>
            </div>
          </div>
          <div className="incident-core-visual" aria-hidden="true">
            <span className="core-orbit orbit-one" />
            <span className="core-orbit orbit-two" />
            <img src="/visuals/signalforge-core.png" alt="" />
          </div>
        </div>
        {view === 'command' && (
          <div className="command-view view-enter">
            <section className="room-card glass-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">
                    <Headphones size={14} /> LIVE VOICE ROOM
                  </span>
                  <h2>{room.channel}</h2>
                </div>
                <span className="room-protocol">
                  <RadioTower size={17} />
                  Agora SD-RTN · encrypted media
                </span>
              </div>
              <section className="agora-console">
                <div className="agora-connection-row">
                  <span className="agora-logo" aria-label="Agora live media">
                    <RadioTower size={22} />
                    <i />
                  </span>
                  <div className="agora-title">
                    <b>Agora RTC room</b>
                    <span className={`connection-state ${room.state}`}>
                      <i />
                      {room.state === 'connected'
                        ? `Live as ${identity.name}`
                        : room.state === 'connecting'
                          ? 'Connecting…'
                          : room.state === 'error'
                            ? 'Needs attention'
                            : 'Ready to join'}
                    </span>
                  </div>
                  <label className="room-field">
                    <span>Channel</span>
                    <input
                      value={room.channel}
                      onChange={(e) =>
                        room.setChannel(
                          e.target.value.replace(/[^A-Za-z0-9_-]/g, ''),
                        )
                      }
                      disabled={
                        room.state === 'connected' ||
                        room.state === 'connecting'
                      }
                    />
                  </label>
                  {room.state === 'connected' ? (
                    <button
                      className="leave-room-btn"
                      onClick={() => void leaveRoom()}
                    >
                      <LogOut size={18} />
                      Leave
                    </button>
                  ) : (
                    <button
                      className="join-room-btn"
                      onClick={() => {
                        autoStartDemo.current = true;
                        void room
                          .join({ startMuted: true })
                          .then(() =>
                            setStarted((value) => value ?? Date.now()),
                          );
                      }}
                      disabled={
                        !identity.name.trim() || room.state === 'connecting'
                      }
                    >
                      <LogIn size={18} />
                      Join muted · start response
                    </button>
                  )}
                </div>
                {room.error && (
                  <div className="agora-error">
                    <AlertTriangle size={17} />
                    {room.error}
                  </div>
                )}
                <div className="live-capture-grid">
                  <div className="live-participants">
                    <div className="live-panel-heading">
                      <span>IDENTITY + PARTICIPANTS</span>
                      <b>{participants.length}</b>
                    </div>
                    <div className="identity-fields">
                      <label>
                        <span>Your name</span>
                        <input
                          value={identity.name}
                          onChange={(e) =>
                            setIdentity({ ...identity, name: e.target.value })
                          }
                          placeholder="Enter your real name"
                        />
                      </label>
                      <label>
                        <span>Your role</span>
                        <input
                          value={identity.role}
                          onChange={(e) =>
                            setIdentity({ ...identity, role: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <div className="live-user-list">
                      {participants.length ? (
                        participants.map((p) => (
                          <span
                            className={
                              room.activeSpeaker === p.uid
                                ? 'live-user speaking'
                                : 'live-user'
                            }
                            key={String(p.uid)}
                          >
                            <Avatar
                              name={p.name}
                              size="sm"
                              speaking={room.activeSpeaker === p.uid}
                              ai={p.ai}
                            />
                            <span>
                              <b>{p.name}</b>
                              <small>{p.role}</small>
                            </span>
                          </span>
                        ))
                      ) : (
                        <p>
                          Enter your identity and join. Arrivals sync from
                          Agora.
                        </p>
                      )}
                    </div>
                    <button
                      className={
                        room.muted ? 'media-control muted' : 'media-control'
                      }
                      onClick={() => void room.toggleMute()}
                      disabled={room.state !== 'connected'}
                    >
                      {room.muted ? <MicOff size={19} /> : <Mic size={19} />}
                      {room.muted ? 'Unmute' : 'Mute microphone'}
                    </button>
                  </div>
                  <div className="transcription-control">
                    <div className="live-panel-heading">
                      <span>VOICE → EVIDENCE</span>
                      <b>
                        {latest?.engine === 'gemini'
                          ? 'Gemini live'
                          : 'Listening'}
                      </b>
                    </div>
                    <button
                      className={
                        speech.listening
                          ? 'capture-btn listening'
                          : 'capture-btn'
                      }
                      onClick={speech.listening ? speech.stop : speech.start}
                      disabled={!speech.supported || room.state !== 'connected'}
                    >
                      {speech.listening ? (
                        <MicOff size={18} />
                      ) : (
                        <Mic size={18} />
                      )}
                      {speech.listening
                        ? 'Stop transcription'
                        : 'Start live transcription'}
                    </button>
                    <div className="manual-transcript-row">
                      <input
                        className={
                          speech.interim || finalTranscript
                            ? 'live-dictation-input'
                            : ''
                        }
                        value={speech.interim || finalTranscript || manual}
                        readOnly={Boolean(speech.interim || finalTranscript)}
                        onChange={(e) => setManual(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && submit()}
                        placeholder={
                          speech.listening
                            ? 'Speak now — your words will appear here live'
                            : 'Intervene: ask, challenge, or suggest a check'
                        }
                      />
                      <button
                        onClick={submit}
                        disabled={
                          room.state !== 'connected' ||
                          !manual.trim() ||
                          analyzing
                        }
                      >
                        {analyzing ? (
                          <RefreshCw className="spin" size={18} />
                        ) : (
                          <Send size={18} />
                        )}
                      </button>
                    </div>
                    {(speech.interim || finalTranscript) && (
                      <p className="interim-copy live-transcription-state">
                        <SignalBars active={Boolean(speech.interim)} />
                        {speech.interim
                          ? 'Listening · transcript is updating live'
                          : analyzing
                            ? 'Transcript complete · Gemini is classifying it'
                            : 'Transcript complete · preparing evidence'}
                      </p>
                    )}
                    {agentCaption && (
                      <div className="agent-live-caption">
                        <Avatar name={agentCaption.speaker} size="sm" ai />
                        <div>
                          <span>
                            <SignalBars active /> {agentCaption.speaker}{' '}
                            speaking · {agentCaption.phase}
                          </span>
                          <p>
                            {agentCaption.text ||
                              'Listening for the first words…'}
                            <i />
                          </p>
                        </div>
                      </div>
                    )}
                    {!speech.interim &&
                      !finalTranscript &&
                      !agentCaption &&
                      analyzing && (
                        <div className="classification-pending">
                          <RefreshCw className="spin" size={16} />
                          <span>
                            Gemini is separating evidence, uncertainty, and
                            next actions…
                          </span>
                        </div>
                      )}
                    {!speech.interim &&
                      !finalTranscript &&
                      !agentCaption &&
                      !analyzing &&
                      latest && (
                      <div className="live-insight">
                        <span className={`claim-badge ${latest.category}`}>
                          {latest.category}
                        </span>
                        <div>
                          <b>{latest.normalizedClaim}</b>
                          <p>{latest.recommendation.title}</p>
                        </div>
                        <strong>{Math.round(latest.confidence * 100)}%</strong>
                      </div>
                      )}
                  </div>
                </div>
              </section>
              <div className="participant-row">
                {participants.length ? (
                  participants.map((p) => (
                    <div
                      className={
                        room.activeSpeaker === p.uid
                          ? 'person active'
                          : 'person'
                      }
                      key={String(p.uid)}
                    >
                      <Avatar
                        name={p.name}
                        speaking={room.activeSpeaker === p.uid}
                        ai={p.ai}
                      />
                      <span>
                        <b>{p.name}</b>
                        <small>{p.role}</small>
                      </span>
                      {room.activeSpeaker === p.uid && <SignalBars />}
                    </div>
                  ))
                ) : (
                  <Empty icon={Users}>No one is in the room yet.</Empty>
                )}
              </div>
              <div className="transcript-window">
                <div className="transcript-top">
                  <span>
                    <MessageSquareText size={15} />
                    Live transcript
                  </span>
                  <span className="captions-status">
                    <i />
                    Agora data stream
                  </span>
                </div>
                <div className="transcript-list">
                  {room.messages.length ? (
                    room.messages.slice(-8).map((m) => {
                      const i = insights.find((x) => x.messageId === m.id);
                      return (
                        <article className="transcript-line" key={m.id}>
                          <Avatar
                            name={m.speaker}
                            size="sm"
                            ai={voiceAgentProfiles.some(
                              (profile) => profile.name === m.speaker,
                            )}
                          />
                          <time>{clock(m.sentAt)}</time>
                          <div>
                            <b>{m.speaker}</b>
                            <p>{m.text}</p>
                            <small
                              className={`event-note ${i?.category ?? ''}`}
                            >
                              {i
                                ? `${i.category} · ${Math.round(i.confidence * 100)}% · ${i.engine}`
                                : 'Analyzing…'}
                            </small>
                          </div>
                        </article>
                      );
                    })
                  ) : (
                    <Empty icon={Mic}>
                      Speak after joining; live statements appear automatically.
                    </Empty>
                  )}
                </div>
              </div>
            </section>
            <aside className="intelligence-card glass-card">
              <div className="ai-heading">
                <span className="ai-icon">
                  <BrainCircuit size={20} />
                </span>
                <div>
                  <span className="eyebrow">LIVE INCIDENT MEMORY</span>
                  <h2>Shared understanding</h2>
                </div>
                <span className="confidence">
                  {insights.length
                    ? `${Math.round((insights.reduce((s, i) => s + i.confidence, 0) / insights.length) * 100)}% avg`
                    : 'Awaiting evidence'}
                </span>
              </div>
              <div className="situation-summary">
                <p>
                  {latest?.normalizedClaim ??
                    'No claims captured. SignalForge summarizes only what the room or connected systems provide.'}
                </p>
                <div className="source-row">
                  <span>
                    <CheckCircle2 size={12} />
                    {facts.length} confirmed facts
                  </span>
                  <span>
                    <Link2 size={12} />
                    {room.messages.length} statements
                  </span>
                </div>
              </div>
              <div className="state-grid">
                {[
                  {
                    category: 'fact' as Category,
                    label: 'Verified facts',
                    icon: ShieldCheck,
                  },
                  {
                    category: 'hypothesis' as Category,
                    label: 'Active theories',
                    icon: BrainCircuit,
                  },
                  {
                    category: 'conflict' as Category,
                    label: 'Conflicts',
                    icon: AlertTriangle,
                  },
                  {
                    category: 'question' as Category,
                    label: 'Open questions',
                    icon: Lightbulb,
                  },
                ].map(({ category, label, icon: StateIcon }) => (
                  <button key={category}>
                    <span className={`state-icon ${category}`}>
                      <StateIcon size={17} />
                    </span>
                    <b>
                      {insights.filter((i) => i.category === category).length}
                    </b>
                    <small>{label}</small>
                  </button>
                ))}
              </div>
              <div className="watch-item">
                <span className="watch-icon">
                  <Zap size={17} />
                </span>
                <div>
                  <small>NEXT-BEST CHECK</small>
                  <b>
                    {latest?.recommendation.title ??
                      'Waiting for a live statement'}
                  </b>
                  <p>
                    {latest
                      ? `${latest.recommendation.informationGain}% information gain · ${latest.recommendation.ownerRole}`
                      : 'Generated from current evidence only'}
                  </p>
                </div>
              </div>
            </aside>
            <section className="metric-section glass-card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">RECOVERY TELEMETRY</span>
                  <h2>Current Datadog signals</h2>
                </div>
                <span className={`telemetry-source ${telemetry.status}`}>
                  <Activity size={14} />
                  {telemetry.status === 'live' && t
                    ? `Live · ${clock(t.observedAt)}`
                    : telemetry.status === 'connecting'
                      ? 'Connecting…'
                      : 'No live values'}
                </span>
              </div>
              <div className="metrics-grid">
                <Metric
                  label="Checkout success"
                  value={t?.checkoutSuccess?.toFixed(1) ?? '—'}
                  suffix="%"
                  live={Boolean(t)}
                />
                <Metric
                  label="Payment failures"
                  value={t?.paymentFailures?.toFixed(1) ?? '—'}
                  suffix="%"
                  live={Boolean(t)}
                />
                <Metric
                  label="Queue lag"
                  value={
                    t?.queueLagSeconds == null
                      ? '—'
                      : String(Math.round(t.queueLagSeconds))
                  }
                  suffix="s"
                  live={Boolean(t)}
                />
              </div>
              {telemetry.error && (
                <p className="telemetry-error">{telemetry.error}</p>
              )}
            </section>
            <CommandLogSignals
              logs={telemetry.logs}
              status={telemetry.status}
              openAll={() => setView('logs')}
            />
            <AgentTeam
              connected={room.state === 'connected'}
              statuses={agents}
              toggle={(p) => void toggleAgent(p)}
              demoStatus={demoStatus}
              demoStep={demoStep}
              demoTotal={demoTotal}
              startDemo={() => void startDemo()}
              pauseDemo={() =>
                setDemoStatus((status) =>
                  status === 'paused' ? 'running' : 'paused',
                )
              }
              nextDemo={() => void nextDemoLine()}
              stopDemo={() => void stopDemo()}
              demoError={demoError}
              demoSpeaker={demoSpeaker}
              demoPhase={demoPhase}
              demoBusy={demoBusy}
            />
          </div>
        )}
        {view === 'evidence' && <Evidence insights={insights} />}
        {view === 'timeline' && (
          <Timeline messages={room.messages} insights={insights} />
        )}
        {view === 'missions' && (
          <Missions
            missions={missions}
            toggle={(id) =>
              setMissions((ms) =>
                ms.map((m) => (m.id === id ? { ...m, done: !m.done } : m)),
              )
            }
          />
        )}
        {view === 'recommendations' && (
          <Recommendations
            insights={insights}
            missions={missions}
            accept={accept}
          />
        )}
        {view === 'logs' && (
          <LiveLogs
            logs={telemetry.logs}
            status={telemetry.status}
            error={telemetry.error}
          />
        )}
        {view === 'integrations' && (
          <Integrations
            insights={insights}
            messages={room.messages}
            missions={missions}
          />
        )}
      </section>
    </main>
  );
}
