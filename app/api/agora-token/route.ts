import { RtcRole, RtcTokenBuilder } from 'agora-token';
import { getConfig } from '@/lib/runtime-config';
import { authorizeRoom, requireUser } from '@/lib/auth';
import { consumeUsage, rateLimitResponse } from '@/lib/rate-limit';

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;
  const { searchParams } = new URL(request.url);
  const channel = searchParams.get('channel')?.trim();
  const requestedUid = Number(searchParams.get('uid') ?? '0');
  const appId = getConfig('NEXT_PUBLIC_AGORA_APP_ID');
  const certificate = getConfig('AGORA_APP_CERTIFICATE');

  if (!channel || channel.length > 64 || !/^[A-Za-z0-9_-]+$/.test(channel)) {
    return Response.json({ error: 'Invalid channel name.' }, { status: 400 });
  }
  if (!(await authorizeRoom(auth.user, channel))) return Response.json({ error: 'Room access denied.' }, { status: 403 });
  const usage = await consumeUsage(auth.user, 'agora');
  if (!usage.allowed) return rateLimitResponse(usage.limit);
  if (!appId)
    return Response.json(
      { error: 'Agora App ID is not configured.' },
      { status: 503 },
    );
  if (!certificate) {
    return Response.json({ token: null, mode: 'app-id-only', uid: null });
  }

  // A token generated for a numeric UID must be joined with that exact UID.
  // Allocate one server-side when the browser requests automatic assignment.
  const uid =
    Number.isSafeInteger(requestedUid) &&
    requestedUid > 0 &&
    requestedUid <= 2_147_483_647
      ? requestedUid
      : (crypto.getRandomValues(new Uint32Array(1))[0] % 2_147_483_647) + 1;

  const validitySeconds = 3600;
  const expiresAt = Math.floor(Date.now() / 1000) + validitySeconds;
  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    certificate,
    channel,
    uid,
    RtcRole.PUBLISHER,
    validitySeconds,
    validitySeconds,
  );
  return Response.json({ token, mode: 'token', uid, expiresAt });
}
