import { authorizeRoom, requireUser } from '@/lib/auth';
import { getDb, nowSeconds } from '@/lib/db';
import { consumeUsage, rateLimitResponse } from '@/lib/rate-limit';
import { randomToken, sha256 } from '@/lib/security';

const ROLES = new Set(['observer', 'responder', 'commander']);

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;
  const { slug } = await context.params;
  const room = await authorizeRoom(auth.user, slug);
  if (!room)
    return Response.json({ error: 'Room access denied.' }, { status: 403 });
  if (!room.canManage && !room.canInvite)
    return Response.json(
      { error: 'Only room managers can invite responders.' },
      { status: 403 },
    );
  const usage = await consumeUsage(auth.user, 'invite');
  if (!usage.allowed) return rateLimitResponse(usage.limit);
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const targetType = String(body.targetType || 'email');
  const targetId = String(body.targetId || '');
  const email = String(body.email || '')
    .trim()
    .toLowerCase();
  const role = ROLES.has(String(body.role)) ? String(body.role) : 'observer';
  const db = getDb();
  const timestamp = nowSeconds();
  if (targetType === 'person' && targetId) {
    const target = await db
      .prepare(
        `SELECT u.id FROM users u JOIN organization_members om ON om.user_id=u.id WHERE u.id=? AND om.organization_id=? AND om.status='active'`,
      )
      .bind(targetId, auth.user.organizationId)
      .first<{ id: string }>();
    if (!target)
      return Response.json(
        { error: 'That member is not part of this organization.' },
        { status: 404 },
      );
    await db
      .prepare(
        `INSERT INTO room_members(room_id,user_id,role,can_invite,joined_at) VALUES(?,?,?,?,?) ON CONFLICT(room_id,user_id) DO UPDATE SET role=excluded.role`,
      )
      .bind(room.id, target.id, role, role === 'commander' ? 1 : 0, timestamp)
      .run();
    return Response.json({ status: 'added', usage });
  }
  if (targetType === 'team' && targetId) {
    const team = await db
      .prepare('SELECT id,kind FROM teams WHERE id=? AND organization_id=?')
      .bind(targetId, auth.user.organizationId)
      .first<{ id: string; kind: string }>();
    if (!team)
      return Response.json({ error: 'Team not found.' }, { status: 404 });
    if (team.kind === 'agent') {
      await db.batch(
        ['aarav', 'meera', 'kabir', 'ira'].map((profile) =>
          db
            .prepare(
              `INSERT INTO room_agents(room_id,profile_id,enabled,added_by,added_at) VALUES(?,?,1,?,?) ON CONFLICT(room_id,profile_id) DO UPDATE SET enabled=1`,
            )
            .bind(room.id, profile, auth.user.id, timestamp),
        ),
      );
    } else {
      await db
        .prepare(
          `INSERT INTO room_members(room_id,user_id,role,can_invite,joined_at) SELECT ?,tm.user_id,?,0,? FROM team_members tm WHERE tm.team_id=? ON CONFLICT(room_id,user_id) DO UPDATE SET role=excluded.role`,
        )
        .bind(room.id, role, timestamp, targetId)
        .run();
    }
    return Response.json({ status: 'team-added', usage });
  }
  if (targetType !== 'link' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return Response.json(
      { error: 'Enter a valid invite email.' },
      { status: 400 },
    );
  const existing = email
    ? await db
        .prepare('SELECT id FROM users WHERE email=?')
        .bind(email)
        .first<{ id: string }>()
    : null;
  if (existing) {
    await db
      .prepare(
        `INSERT INTO room_members(room_id,user_id,role,can_invite,joined_at) VALUES(?,?,?,?,?) ON CONFLICT(room_id,user_id) DO UPDATE SET role=excluded.role`,
      )
      .bind(room.id, existing.id, role, role === 'commander' ? 1 : 0, timestamp)
      .run();
    return Response.json({ status: 'added', usage });
  }
  const token = randomToken();
  await db
    .prepare(
      `INSERT INTO invitations(id,organization_id,room_id,email,target_type,room_role,token_hash,invited_by,status,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,'pending',?,?)`,
    )
    .bind(
      crypto.randomUUID(),
      auth.user.organizationId,
      room.id,
      email || null,
      targetType === 'link' ? 'link' : 'email',
      role,
      await sha256(token),
      auth.user.id,
      timestamp + 60 * 60 * 24 * 7,
      timestamp,
    )
    .run();
  return Response.json({
    status: 'link-created',
    invitePath: `/invite/${token}`,
    usage,
  });
}
