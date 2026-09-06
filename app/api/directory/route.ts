import { authorizeRoom, requireUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;
  const url = new URL(request.url);
  const roomId = url.searchParams.get('roomId') || '';
  const query = `%${(url.searchParams.get('q') || '').slice(0, 60)}%`;
  if (!(await authorizeRoom(auth.user, roomId)))
    return Response.json({ error: 'Room access denied.' }, { status: 403 });
  const db = getDb();
  const [people, teams, agents] = await Promise.all([
    db
      .prepare(`SELECT u.id,u.display_name AS name,u.email,om.role,
        CASE WHEN rm.user_id IS NULL THEN 0 ELSE 1 END AS inRoom,
        rm.role AS roomRole
        FROM organization_members om JOIN users u ON u.id=om.user_id
        LEFT JOIN room_members rm ON rm.user_id=u.id AND rm.room_id=?
        WHERE om.organization_id=? AND om.status='active' AND (u.display_name LIKE ? OR u.email LIKE ?)
        ORDER BY inRoom DESC,u.display_name LIMIT 20`)
      .bind(roomId, auth.user.organizationId, query, query)
      .all(),
    db
      .prepare(
        'SELECT id,name,description,kind,accent FROM teams WHERE organization_id=? AND (name LIKE ? OR description LIKE ?) ORDER BY kind,name LIMIT 20',
      )
      .bind(auth.user.organizationId, query, query)
      .all(),
    getDb()
      .prepare(
        'SELECT profile_id AS id, enabled FROM room_agents WHERE room_id=? ORDER BY profile_id',
      )
      .bind(roomId)
      .all(),
  ]);
  return Response.json({
    people: people.results,
    teams: teams.results,
    agents: agents.results,
  });
}
