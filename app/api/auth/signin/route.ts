import { createSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { verifyPassword } from '@/lib/security';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const email = String(body.email || '')
    .trim()
    .toLowerCase();
  const password = String(body.password || '');
  const returnTo = String(body.returnTo || '');
  const account = await getDb()
    .prepare(
      'SELECT id, password_hash AS passwordHash, password_salt AS passwordSalt, email_verified AS emailVerified FROM users WHERE email = ?',
    )
    .bind(email)
    .first<{
      id: string;
      passwordHash: string;
      passwordSalt: string;
      emailVerified: number;
    }>();
  if (
    !account ||
    !(await verifyPassword(
      password,
      account.passwordSalt,
      account.passwordHash,
    ))
  )
    return Response.json(
      { error: 'The email or password is incorrect.' },
      { status: 401 },
    );
  const session = await createSession(account.id);
  const safeReturn =
    returnTo.startsWith('/') && !returnTo.startsWith('//')
      ? returnTo
      : '/rooms/payments-war-room';
  return Response.json(
    { redirectTo: safeReturn },
    { headers: { 'Set-Cookie': session.cookie } },
  );
}
