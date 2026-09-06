import { requireUser } from '@/lib/auth';
import { getDb, nowSeconds } from '@/lib/db';
import { consumeUsage, rateLimitResponse } from '@/lib/rate-limit';
import { slugify } from '@/lib/security';

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;
  const rooms = await getDb()
    .prepare(`SELECT r.id,r.slug,r.name,r.description,r.severity,r.status,rm.role,rm.can_invite AS canInvite,
    (SELECT COUNT(*) FROM room_members x WHERE x.room_id=r.id) AS participantCount,
    (SELECT COUNT(*) FROM room_agents a WHERE a.room_id=r.id AND a.enabled=1) AS agentCount
    FROM rooms r JOIN room_members rm ON rm.room_id=r.id WHERE rm.user_id=? AND r.organization_id=? ORDER BY r.updated_at DESC`)
    .bind(auth.user.id, auth.user.organizationId)
    .all();
  return Response.json({ user: auth.user, rooms: rooms.results });
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;
  const usage = await consumeUsage(auth.user, 'room_create');
  if (!usage.allowed) return rateLimitResponse(usage.limit);
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const name = String(body.name || '')
    .trim()
    .slice(0, 100);
  const description = String(body.description || '')
    .trim()
    .slice(0, 280);
  const severity = ['SEV-1', 'SEV-2', 'SEV-3', 'SEV-4'].includes(
    String(body.severity),
  )
    ? String(body.severity)
    : 'SEV-2';
  if (name.length < 3)
    return Response.json(
      { error: 'Give the room a descriptive name.' },
      { status: 400 },
    );
  const db = getDb();
  const id = crypto.randomUUID();
  const timestamp = nowSeconds();
  let slug = slugify(name);
  if (
    await db
      .prepare('SELECT id FROM rooms WHERE organization_id=? AND slug=?')
      .bind(auth.user.organizationId, slug)
      .first()
  )
    slug += `-${id.slice(0, 5)}`;
  const inserts: D1PreparedStatement[] = [
    db
      .prepare(
        "INSERT INTO rooms (id,organization_id,slug,name,description,severity,status,visibility,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,'open','restricted',?,?,?)",
      )
      .bind(
        id,
        auth.user.organizationId,
        slug,
        name,
        description,
        severity,
        auth.user.id,
        timestamp,
        timestamp,
      ),
    db
      .prepare(
        "INSERT INTO room_members (room_id,user_id,role,can_invite,joined_at) VALUES (?,?,'owner',1,?)",
      )
      .bind(id, auth.user.id, timestamp),
  ];
  for (const profileId of ['aarav', 'meera', 'kabir', 'ira'])
    inserts.push(
      db
        .prepare(
          'INSERT INTO room_agents (room_id,profile_id,enabled,added_by,added_at) VALUES (?,?,1,?,?)',
        )
        .bind(id, profileId, auth.user.id, timestamp),
    );
  await db.batch(inserts);
  return Response.json(
    {
      room: { id, slug, name, description, severity },
      redirectTo: `/rooms/${slug}`,
      usage,
    },
    { status: 201 },
  );
}
