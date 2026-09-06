import { requireUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { DAILY_LIMITS } from '@/lib/rate-limit';

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;
  const date = new Date().toISOString().slice(0,10);
  const result = await getDb().prepare('SELECT scope,count,limit_value AS limitValue FROM daily_usage WHERE usage_date=? AND organization_id=? AND user_id=?').bind(date,auth.user.organizationId,auth.user.id).all<{scope:string;count:number;limitValue:number}>();
  const actual = new Map(result.results.map((item) => [item.scope,item]));
  return Response.json({ date, usage: Object.entries(DAILY_LIMITS).map(([scope,limitValue]) => ({ scope, count: actual.get(scope)?.count || 0, limitValue })) });
}
