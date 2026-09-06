import {
  Agent,
  AgoraClient,
  Area,
  ExpiresIn,
  GeminiLive,
  type AgentSession,
} from 'agora-agents';
import { getConfig } from '@/lib/runtime-config';
import {
  findVoiceAgentProfile,
  type VoiceAgentProfile,
} from '@/lib/voice-agent-profiles';
import { incidentDemoScript } from '@/lib/incident-demo';

type RunningAgent = {
  agentId: string;
  profile: VoiceAgentProfile;
  session: AgentSession;
  channel: string;
  requesterUid: string;
  startedAt: string;
};

const runningAgents = new Map<string, RunningAgent>();
type DemoSession = {
  index: number;
  requesterUid: string;
  startedAt: string;
  readyAt: number;
  advancing: boolean;
};

const demoSessions = new Map<string, DemoSession>();

// The Agents API acknowledges a session before its RTC audio publication is
// necessarily visible to every listener. Give the opening speaker time to
// publish before the first directed `say` call.
const DEMO_AGENT_WARMUP_MS = 4_000;
const DEMO_START_ORDER: VoiceAgentProfile['id'][] = [
  'commander',
  'support',
  'sre',
  'application',
];

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function speechWindow(text: string) {
  const words = text.trim().split(/\s+/).length;
  return Math.min(20_000, Math.max(7_000, words * 520 + 2_000));
}

function sessionKey(channel: string, profileId: string) {
  return `${channel}:${profileId}`;
}

function createClient() {
  const appId = getConfig('NEXT_PUBLIC_AGORA_APP_ID');
  const appCertificate = getConfig('AGORA_APP_CERTIFICATE');
  if (!appId || !appCertificate)
    throw new Error('Agora App ID and App Certificate are required.');
  return new AgoraClient({
    area: Area.AP,
    appId,
    appCertificate,
  });
}

export function listRunningAgents(channel?: string) {
  return [...runningAgents.values()]
    .filter((running) => !channel || running.channel === channel)
    .map(
      ({
        agentId,
        profile,
        channel: agentChannel,
        requesterUid,
        startedAt,
      }) => ({
        agentId,
        profileId: profile.id,
        uid: profile.uid,
        name: profile.name,
        role: profile.role,
        channel: agentChannel,
        requesterUid,
        startedAt,
      }),
    );
}

export async function getVoiceAgentHistory(channel?: string) {
  return Promise.all(
    [...runningAgents.values()]
      .filter((running) => !channel || running.channel === channel)
      .map(async (running) => ({
        agentId: running.agentId,
        profileId: running.profile.id,
        name: running.profile.name,
        role: running.profile.role,
        uid: running.profile.uid,
        startedAt: running.startedAt,
        contents: (await running.session.getHistory()).contents ?? [],
      })),
  );
}

export async function startVoiceAgent(input: {
  profileId: string;
  channel: string;
  requesterUid: string;
  guidedDemo?: boolean;
}) {
  const profile = findVoiceAgentProfile(input.profileId);
  if (!profile) throw new Error('Unknown voice agent role.');
  const key = sessionKey(input.channel, profile.id);
  const existing = runningAgents.get(key);
  if (existing) return existing;

  const client = createClient();
  const geminiApiKey = getConfig('GEMINI_API_KEY');
  if (!geminiApiKey)
    throw new Error('Gemini API key is required for voice agents.');
  const agent = new Agent({
    client,
    advancedFeatures: { enable_rtm: true, enable_tools: false },
    parameters: {
      audio_scenario: 'chorus',
      data_channel: 'datastream',
      enable_error_message: true,
      enable_metrics: true,
    },
  }).withMllm(
    new GeminiLive({
      apiKey: geminiApiKey,
      model: getConfig('GEMINI_LIVE_MODEL') || 'gemini-3.1-flash-live-preview',
      voice: profile.voice,
      instructions: profile.instructions,
      greetingMessage: input.guidedDemo ? '' : profile.greeting,
      failureMessage: 'I could not verify that yet.',
      transcribeAgent: true,
      transcribeUser: true,
      inputModalities: ['audio'],
      outputModalities: ['audio'],
    }),
  );

  const session = agent.createSession({
    name: `signalforge-${profile.id}-${Date.now()}`,
    channel: input.channel,
    agentUid: profile.uid,
    remoteUids: input.guidedDemo
      ? [String(2_147_480_000 + profile.avatar)]
      : [input.requesterUid],
    idleTimeout: 240,
    expiresIn: ExpiresIn.minutes(10),
    debug: false,
    warn: () => undefined,
  });
  const agentId = await session.start();
  const running: RunningAgent = {
    agentId,
    profile,
    session,
    channel: input.channel,
    requesterUid: input.requesterUid,
    startedAt: new Date().toISOString(),
  };
  runningAgents.set(key, running);
  return running;
}

export function getVoiceDemoState(channel: string) {
  const demo = demoSessions.get(channel);
  return {
    active: Boolean(demo),
    index: demo?.index ?? 0,
    total: incidentDemoScript.length,
    completed: Boolean(demo && demo.index >= incidentDemoScript.length),
    startedAt: demo?.startedAt ?? null,
    waitMs: demo ? Math.max(0, demo.readyAt - Date.now()) : 0,
    advancing: demo?.advancing ?? false,
  };
}

export async function startVoiceDemo(input: {
  channel: string;
  requesterUid: string;
}) {
  await stopVoiceDemo(input.channel);
  const started: RunningAgent[] = [];
  try {
    // Ira opens the incident, so connect her first. The remaining responders
    // starting afterwards naturally gives her the longest RTC warm-up window.
    for (const profileId of DEMO_START_ORDER) {
      const profile = findVoiceAgentProfile(profileId);
      if (!profile) throw new Error(`Missing voice profile: ${profileId}`);
      started.push(
        await startVoiceAgent({
          profileId: profile.id,
          channel: input.channel,
          requesterUid: input.requesterUid,
          guidedDemo: true,
        }),
      );
    }
  } catch (error) {
    await Promise.all(
      started.map((running) => running.session.stop().catch(() => undefined)),
    );
    started.forEach((running) =>
      runningAgents.delete(sessionKey(running.channel, running.profile.id)),
    );
    throw error;
  }
  demoSessions.set(input.channel, {
    index: 0,
    requesterUid: input.requesterUid,
    startedAt: new Date().toISOString(),
    readyAt: Date.now() + DEMO_AGENT_WARMUP_MS,
    advancing: false,
  });
  return getVoiceDemoState(input.channel);
}

export async function speakNextDemoLine(channel: string) {
  const demo = demoSessions.get(channel);
  if (!demo) throw new Error('Start the response team first.');
  if (demo.advancing) {
    return {
      ...getVoiceDemoState(channel),
      line: null,
      durationMs: 0,
    };
  }
  demo.advancing = true;
  try {
    const remaining = Math.max(0, demo.readyAt - Date.now());
    if (remaining) await wait(remaining);
    if (demoSessions.get(channel) !== demo) {
      return {
        ...getVoiceDemoState(channel),
        line: null,
        durationMs: 0,
      };
    }
    const line = incidentDemoScript[demo.index];
    if (!line) {
      return {
        ...getVoiceDemoState(channel),
        line: null,
        durationMs: 0,
      };
    }
    const running = runningAgents.get(sessionKey(channel, line.speaker));
    if (!running)
      throw new Error('The selected response speaker is not connected.');
    await running.session.say(line.text, { interruptable: false });
    const durationMs = speechWindow(line.text);
    demo.readyAt = Date.now() + durationMs;
    demo.index += 1;
    return { ...getVoiceDemoState(channel), line, durationMs };
  } finally {
    demo.advancing = false;
  }
}

export async function interveneVoiceDemo(channel: string, text: string) {
  const demo = demoSessions.get(channel);
  const running = runningAgents.get(sessionKey(channel, 'commander'));
  if (!running) throw new Error('The incident facilitator is not connected.');
  const remaining = demo ? Math.max(0, demo.readyAt - Date.now()) : 0;
  if (remaining) await wait(remaining);
  await running.session.think(
    `The human observer intervened with this suggestion: ${text}. Briefly acknowledge it, classify it as a fact, hypothesis, question, or proposed action, and state the safest next step. Do not execute anything.`,
    { interruptable: false, metadata: { source: 'human-observer' } },
  );
  if (demo) demo.readyAt = Date.now() + 10_000;
}

export async function stopVoiceDemo(channel: string) {
  const running = [...runningAgents.values()].filter(
    (agent) => agent.channel === channel,
  );
  await Promise.all(
    running.map((agent) => agent.session.stop().catch(() => undefined)),
  );
  running.forEach((agent) =>
    runningAgents.delete(sessionKey(agent.channel, agent.profile.id)),
  );
  demoSessions.delete(channel);
  return running.length;
}

export async function stopVoiceAgent(channel: string, profileId: string) {
  const key = sessionKey(channel, profileId);
  const running = runningAgents.get(key);
  if (!running) return false;
  try {
    await running.session.stop();
  } finally {
    runningAgents.delete(key);
    if (demoSessions.has(channel)) demoSessions.delete(channel);
  }
  return true;
}
