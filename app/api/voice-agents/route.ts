import { emitOtelIncidentEvent } from '@/lib/otel';
import {
  getVoiceDemoState,
  getVoiceAgentHistory,
  interveneVoiceDemo,
  listRunningAgents,
  speakNextDemoLine,
  startVoiceAgent,
  startVoiceDemo,
  stopVoiceAgent,
  stopVoiceDemo,
} from '@/lib/voice-agent-runtime';
import { voiceAgentProfiles } from '@/lib/voice-agent-profiles';
import { authorizeRoom, requireUser } from '@/lib/auth';
import { consumeUsage, rateLimitResponse } from '@/lib/rate-limit';

const CHANNEL_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const UID_PATTERN = /^\d{1,10}$/;

function isCompatibleRtcUid(value: unknown): value is string {
  if (typeof value !== 'string' || !UID_PATTERN.test(value)) return false;
  const uid = Number(value);
  return Number.isSafeInteger(uid) && uid > 0 && uid <= 2_147_483_647;
}

export async function GET(request: Request) {
  const channel = new URL(request.url).searchParams.get('channel') ?? undefined;
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;
  if (!channel || !(await authorizeRoom(auth.user, channel))) return Response.json({ error: 'Room access denied.' }, { status: 403 });
  const history = await getVoiceAgentHistory(channel);
  return Response.json({
    profiles: voiceAgentProfiles,
    running: listRunningAgents(channel),
    history,
    demo: channel ? getVoiceDemoState(channel) : null,
  });
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;
  const body = (await request.json()) as {
    action?: unknown;
    profileId?: unknown;
    channel?: unknown;
    requesterUid?: unknown;
    text?: unknown;
  };
  if (
    typeof body.action !== 'string' ||
    typeof body.channel !== 'string' ||
    !CHANNEL_PATTERN.test(body.channel)
  ) {
    return Response.json(
      { error: 'A valid action and channel are required.' },
      { status: 400 },
    );
  }
  const authorizedRoom = await authorizeRoom(auth.user, body.channel);
  if (!authorizedRoom) return Response.json({ error: 'Room access denied.' }, { status: 403 });
  if (['demo-start','start','stop'].includes(body.action) && !authorizedRoom.canManage) return Response.json({ error: 'Only room commanders can manage AI responders.' }, { status: 403 });
  if (['demo-start','demo-next','start'].includes(body.action)) {
    const usage = await consumeUsage(auth.user, 'voice');
    if (!usage.allowed) return rateLimitResponse(usage.limit);
  }
  try {
    if (body.action === 'demo-stop') {
      const stopped = await stopVoiceDemo(body.channel);
      return Response.json({ stopped, demo: getVoiceDemoState(body.channel) });
    }
    if (body.action === 'demo-next') {
      return Response.json(await speakNextDemoLine(body.channel));
    }
    if (body.action === 'intervene') {
      if (typeof body.text !== 'string' || !body.text.trim()) {
        return Response.json(
          { error: 'An observer suggestion is required.' },
          { status: 400 },
        );
      }
      await interveneVoiceDemo(body.channel, body.text.trim().slice(0, 800));
      return Response.json({ accepted: true });
    }
    if (body.action === 'demo-start') {
      if (!isCompatibleRtcUid(body.requesterUid)) {
        return Response.json(
          { error: 'Join the room before starting the response team.' },
          { status: 400 },
        );
      }
      return Response.json({
        demo: await startVoiceDemo({
          channel: body.channel,
          requesterUid: body.requesterUid,
        }),
        running: listRunningAgents(body.channel),
      });
    }
    if (body.action !== 'start' && body.action !== 'stop') {
      return Response.json({ error: 'Unknown voice action.' }, { status: 400 });
    }
    if (typeof body.profileId !== 'string') {
      return Response.json(
        { error: 'A voice-agent role is required.' },
        { status: 400 },
      );
    }
    if (body.action === 'stop') {
      const stopped = await stopVoiceAgent(body.channel, body.profileId);
      return Response.json({ stopped });
    }
    if (!isCompatibleRtcUid(body.requesterUid)) {
      return Response.json(
        { error: 'Join the room before inviting a voice agent.' },
        { status: 400 },
      );
    }
    const running = await startVoiceAgent({
      profileId: body.profileId,
      channel: body.channel,
      requesterUid: body.requesterUid,
    });
    void emitOtelIncidentEvent('incident.voice_agent.started', {
      'agent.profile': running.profile.id,
      'agora.channel': body.channel,
    }).catch(() => undefined);
    return Response.json({
      agentId: running.agentId,
      profileId: running.profile.id,
      uid: running.profile.uid,
      name: running.profile.name,
      role: running.profile.role,
      state: 'running',
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Voice agent operation failed.',
      },
      { status: 502 },
    );
  }
}
