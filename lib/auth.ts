import { getDb, nowSeconds } from '@/lib/db';
import { randomToken, sha256 } from '@/lib/security';

export const SESSION_COOKIE = 'signalforge_session';

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  organizationId: string;
  organizationName: string;
  organizationRole: string;
};

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get('cookie') || '';
  return (
    cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1) || ''
  );
}

export async function createSession(userId: string) {
  const db = getDb();
  const token = randomToken();
  const timestamp = nowSeconds();
  await db
    .prepare(
      'INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(
      crypto.randomUUID(),
      userId,
      await sha256(token),
      timestamp + 60 * 60 * 24 * 7,
      timestamp,
      timestamp,
    )
    .run();
  return {
    token,
    cookie: `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
  };
}

export async function destroySession(request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token)
    await getDb()
      .prepare('DELETE FROM sessions WHERE token_hash = ?')
      .bind(await sha256(token))
      .run();
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

export async function getSessionUser(
  request: Request,
): Promise<SessionUser | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const timestamp = nowSeconds();
  const user = await getDb()
    .prepare(`
    SELECT u.id, u.email, u.display_name AS displayName, u.email_verified AS emailVerified,
      om.organization_id AS organizationId, o.name AS organizationName, om.role AS organizationRole
    FROM sessions s JOIN users u ON u.id = s.user_id
    JOIN organization_members om ON om.user_id = u.id AND om.status = 'active'
    JOIN organizations o ON o.id = om.organization_id
    WHERE s.token_hash = ? AND s.expires_at > ? ORDER BY om.joined_at ASC LIMIT 1
  `)
    .bind(await sha256(token), timestamp)
    .first<SessionUser>();
  if (!user) return null;
  await getDb()
    .prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?')
    .bind(timestamp, await sha256(token))
    .run();
  return { ...user, emailVerified: Boolean(user.emailVerified) };
}

export async function requireUser(request: Request, verified = false) {
  const user = await getSessionUser(request);
  if (!user)
    return {
      response: Response.json(
        { error: 'Sign in is required.' },
        { status: 401 },
      ),
    } as const;
  if (verified && !user.emailVerified)
    return {
      response: Response.json(
        { error: 'Account access is not active.' },
        { status: 403 },
      ),
    } as const;
  return { user } as const;
}

export async function authorizeRoom(user: SessionUser, roomIdOrSlug: string) {
  return getDb()
    .prepare(`
    SELECT r.id, r.slug, r.name, r.description, r.severity, r.status, rm.role, rm.can_invite AS canInvite,
      CASE WHEN r.created_by = ? OR rm.role IN ('owner','commander') THEN 1 ELSE 0 END AS canManage
    FROM rooms r JOIN room_members rm ON rm.room_id = r.id
    WHERE (r.id = ? OR r.slug = ?) AND rm.user_id = ? AND r.organization_id = ? LIMIT 1
  `)
    .bind(user.id, roomIdOrSlug, roomIdOrSlug, user.id, user.organizationId)
    .first<Record<string, unknown>>();
}
