import { authorizeRoom, requireUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;
  const { slug } = await context.params;
  const room = await authorizeRoom(auth.user, slug);
  if (!room)
    return Response.json(
      { error: 'Room not found or access denied.' },
      { status: 404 },
    );
  const rooms = await getDb()
    .prepare(
      'SELECT r.id,r.slug,r.name,r.severity,r.status,rm.role FROM rooms r JOIN room_members rm ON rm.room_id=r.id WHERE rm.user_id=? AND r.organization_id=? ORDER BY r.updated_at DESC',
    )
    .bind(auth.user.id, auth.user.organizationId)
    .all();
  return Response.json({ user: auth.user, room, rooms: rooms.results });
}
