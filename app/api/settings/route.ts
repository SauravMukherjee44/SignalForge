import {
  clearConfig,
  isConfigKey,
  publicConfiguration,
  setConfig,
} from '@/lib/runtime-config';
import { requireUser } from '@/lib/auth';

const isLocalRequest = (request: Request) => {
  const host = request.headers.get('host') ?? '';
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
};

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;
  return Response.json({
    ...publicConfiguration(),
    storage: 'server-memory',
  });
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;
  if (!['owner','admin'].includes(auth.user.organizationRole)) return Response.json({ error: 'Administrator access is required.' }, { status: 403 });
  if (!isLocalRequest(request)) {
    return Response.json(
      { error: 'Runtime secret entry is available only on localhost.' },
      { status: 403 },
    );
  }
  const body = (await request.json()) as { values?: Record<string, unknown> };
  if (!body.values || typeof body.values !== 'object') {
    return Response.json(
      { error: 'A values object is required.' },
      { status: 400 },
    );
  }
  const saved: string[] = [];
  for (const [key, value] of Object.entries(body.values)) {
    if (!isConfigKey(key) || typeof value !== 'string' || value.length > 8_000)
      continue;
    setConfig(key, value);
    saved.push(key);
  }
  return Response.json({ saved, ...publicConfiguration() });
}

export async function DELETE(request: Request) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;
  if (!['owner','admin'].includes(auth.user.organizationRole)) return Response.json({ error: 'Administrator access is required.' }, { status: 403 });
  if (!isLocalRequest(request)) {
    return Response.json(
      { error: 'Runtime secret clearing is available only on localhost.' },
      { status: 403 },
    );
  }
  const body = (await request.json()) as { keys?: unknown[] };
  let cleared = 0;
  for (const key of body.keys ?? []) {
    if (typeof key === 'string' && isConfigKey(key) && clearConfig(key)) {
      cleared += 1;
    }
  }
  return Response.json({ cleared });
}
