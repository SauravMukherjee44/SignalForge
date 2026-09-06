import { getDb } from '@/lib/db';

export async function GET() {
  try {
    await getDb().prepare('SELECT COUNT(*) AS count FROM users').first();
    return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503 });
  }
}
