import { requireUser } from '@/lib/auth';
import { getDb, nowSeconds } from '@/lib/db';
import { sha256 } from '@/lib/security';

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const invite = await getDb()
    .prepare(
      `SELECT i.email,i.room_role AS roomRole,i.status,i.expires_at AS expiresAt,r.name AS roomName,r.slug,o.name AS organizationName,u.display_name AS invitedBy FROM invitations i JOIN rooms r ON r.id=i.room_id JOIN organizations o ON o.id=i.organization_id JOIN users u ON u.id=i.invited_by WHERE i.token_hash=?`,
    )
    .bind(await sha256(token))
    .first<Record<string, unknown>>();
  if (
    !invite ||
    Number(invite.expiresAt) < nowSeconds() ||
    invite.status !== 'pending'
  )
    return Response.json(
      { error: 'This invitation is invalid or has expired.' },
      { status: 404 },
    );
  return Response.json({
    invite: {
      email: invite.email,
      roomRole: invite.roomRole,
      roomName: invite.roomName,
      organizationName: invite.organizationName,
      invitedBy: invite.invitedBy,
    },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;
  const { token } = await context.params;
  const db = getDb();
  const hash = await sha256(token);
  const invite = await db
    .prepare(
      `SELECT id,organization_id AS organizationId,room_id AS roomId,email,room_role AS roomRole,status,expires_at AS expiresAt FROM invitations WHERE token_hash=?`,
    )
    .bind(hash)
    .first<{
      id: string;
      organizationId: string;
      roomId: string;
      email: string | null;
      roomRole: string;
      status: string;
      expiresAt: number;
    }>();
  if (!invite || invite.status !== 'pending' || invite.expiresAt < nowSeconds())
    return Response.json(
      { error: 'This invitation is invalid or has expired.' },
      { status: 404 },
    );
  if (invite.email && invite.email !== auth.user.email)
    return Response.json(
      {
        error: `This invite was issued to ${invite.email}. Sign in with that address.`,
      },
      { status: 403 },
    );
  const timestamp = nowSeconds();
  await db.batch([
    db
      .prepare(
        `INSERT INTO organization_members(organization_id,user_id,role,status,joined_at) VALUES(?,?,'member','active',?) ON CONFLICT(organization_id,user_id) DO UPDATE SET status='active'`,
      )
      .bind(invite.organizationId, auth.user.id, timestamp),
    db
      .prepare(
        `INSERT INTO room_members(room_id,user_id,role,can_invite,joined_at) VALUES(?,?,?,?,?) ON CONFLICT(room_id,user_id) DO UPDATE SET role=excluded.role`,
      )
      .bind(
        invite.roomId,
        auth.user.id,
        invite.roomRole,
        invite.roomRole === 'commander' ? 1 : 0,
        timestamp,
      ),
    db
      .prepare(
        `UPDATE invitations SET status='accepted',accepted_by=?,accepted_at=? WHERE id=?`,
      )
      .bind(auth.user.id, timestamp, invite.id),
  ]);
  const room = await db
    .prepare('SELECT slug FROM rooms WHERE id=?')
    .bind(invite.roomId)
    .first<{ slug: string }>();
  return Response.json({ redirectTo: `/rooms/${room?.slug || ''}` });
}
