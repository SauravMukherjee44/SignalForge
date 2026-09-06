import { getDb, nowSeconds } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';

export const DAILY_LIMITS = {
  gemini: 200,
  voice: 50,
  agora: 100,
  room_create: 10,
  invite: 100,
  critical_action: 30,
} as const;

export type UsageScope = keyof typeof DAILY_LIMITS;

export async function consumeUsage(user: SessionUser, scope: UsageScope) {
  const db = getDb();
  const date = new Date().toISOString().slice(0, 10);
  const limit = DAILY_LIMITS[scope];
  const id = `${date}:${user.organizationId}:${user.id}:${scope}`;
  await db
    .prepare(`INSERT INTO daily_usage (id, usage_date, organization_id, user_id, scope, count, limit_value, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?) ON CONFLICT(usage_date, organization_id, user_id, scope) DO NOTHING`)
    .bind(id, date, user.organizationId, user.id, scope, limit, nowSeconds())
    .run();
  const changed = await db
    .prepare(
      'UPDATE daily_usage SET count = count + 1, updated_at = ? WHERE id = ? AND count < limit_value',
    )
    .bind(nowSeconds(), id)
    .run();
  const record = await db
    .prepare(
      'SELECT count, limit_value AS limitValue FROM daily_usage WHERE id = ?',
    )
    .bind(id)
    .first<{ count: number; limitValue: number }>();
  const allowed = Number(changed.meta.changes || 0) === 1;
  return {
    allowed,
    count: record?.count || limit,
    limit,
    remaining: Math.max(0, limit - (record?.count || limit)),
  };
}

export function rateLimitResponse(limit: number) {
  const reset = new Date();
  reset.setUTCDate(reset.getUTCDate() + 1);
  reset.setUTCHours(0, 0, 0, 0);
  return Response.json(
    { error: 'Daily service allowance reached.', resetAt: reset.toISOString() },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.ceil((reset.getTime() - Date.now()) / 1000)),
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': '0',
      },
    },
  );
}
