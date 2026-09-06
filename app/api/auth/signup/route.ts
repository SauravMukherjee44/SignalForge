import { createSession } from '@/lib/auth';
import { getDb, nowSeconds } from '@/lib/db';
import { hashPassword, sha256, slugify } from '@/lib/security';

const DEFAULT_TEAMS = [
  [
    'Incident Command',
    'Human incident commanders and deputies',
    'human',
    'violet',
  ],
  [
    'Site Reliability',
    'Infrastructure, telemetry, and recovery engineers',
    'human',
    'cyan',
  ],
  [
    'Payments Engineering',
    'Payments application and platform responders',
    'human',
    'blue',
  ],
  ['Customer Operations', 'Support and customer-impact leads', 'human', 'pink'],
  [
    'Business Response',
    'Business, legal, and communications leaders',
    'human',
    'amber',
  ],
  [
    'AI Response Council',
    'Evidence, skeptic, impact, and facilitation agents',
    'agent',
    'indigo',
  ],
] as const;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const name = String(body.name || '')
    .trim()
    .slice(0, 80);
  const organization = String(body.organization || '')
    .trim()
    .slice(0, 100);
  const inviteToken = String(body.inviteToken || '');
  const returnTo = String(body.returnTo || '');
  const email = String(body.email || '')
    .trim()
    .toLowerCase();
  const password = String(body.password || '');
  const invitation = inviteToken
    ? await getDb()
        .prepare(
          `SELECT id,organization_id AS organizationId,email,status,expires_at AS expiresAt FROM invitations WHERE token_hash=?`,
        )
        .bind(await sha256(inviteToken))
        .first<{
          id: string;
          organizationId: string;
          email: string | null;
          status: string;
          expiresAt: number;
        }>()
    : null;
  const validInvitation =
    invitation &&
    invitation.status === 'pending' &&
    invitation.expiresAt > nowSeconds() &&
    (!invitation.email || invitation.email === email);
  // A shared company deployment must not grant its integration credentials to
  // arbitrary public signups. Invited colleagues can still create accounts.
  const allowedEmails = (process.env.SIGNALFORGE_SIGNUP_EMAILS || '')
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  if (process.env.SIGNALFORGE_PLATFORM === 'railway' && !validInvitation && !allowedEmails.includes(email)) {
    return Response.json({ error: 'This workspace requires a team invitation. Ask your room owner for an invite link.' }, { status: 403 });
  }
  if (
    name.length < 2 ||
    (!validInvitation && organization.length < 2) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  )
    return Response.json(
      { error: 'Enter your name, organization, and a valid work email.' },
      { status: 400 },
    );
  if (
    password.length < 12 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password)
  )
    return Response.json(
      {
        error:
          'Use at least 12 characters with uppercase, lowercase, and a number.',
      },
      { status: 400 },
    );

  const db = getDb();
  if (
    await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
  )
    return Response.json(
      { error: 'An account already exists for this email.' },
      { status: 409 },
    );

  const timestamp = nowSeconds();
  const userId = crypto.randomUUID();
  const organizationId = validInvitation
    ? invitation.organizationId
    : crypto.randomUUID();
  const roomId = crypto.randomUUID();
  const passwordRecord = await hashPassword(password);
  const baseSlug = slugify(organization);
  const organizationSlug = `${baseSlug}-${organizationId.slice(0, 6)}`;

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO users (id,email,display_name,password_hash,password_salt,email_verified,verification_code_hash,verification_expires_at,created_at,updated_at) VALUES (?,?,?,?,?,1,NULL,NULL,?,?)`,
      )
      .bind(
        userId,
        email,
        name,
        passwordRecord.hash,
        passwordRecord.salt,
        timestamp,
        timestamp,
      ),
  ];
  if (validInvitation) {
    statements.push(
      db
        .prepare(
          "INSERT INTO organization_members (organization_id,user_id,role,status,joined_at) VALUES (?,?,'member','active',?)",
        )
        .bind(organizationId, userId, timestamp),
    );
  } else {
    statements.push(
      db
        .prepare(
          'INSERT INTO organizations (id,name,slug,created_by,created_at) VALUES (?,?,?,?,?)',
        )
        .bind(
          organizationId,
          organization,
          organizationSlug,
          userId,
          timestamp,
        ),
      db
        .prepare(
          "INSERT INTO organization_members (organization_id,user_id,role,status,joined_at) VALUES (?,?, 'owner','active',?)",
        )
        .bind(organizationId, userId, timestamp),
      db
        .prepare(
          `INSERT INTO rooms (id,organization_id,slug,name,description,severity,status,visibility,created_by,created_at,updated_at) VALUES (?,?,'payments-war-room','Payments APAC incident','Live payments response command room','SEV-1','open','restricted',?,?,?)`,
        )
        .bind(roomId, organizationId, userId, timestamp, timestamp),
      db
        .prepare(
          "INSERT INTO room_members (room_id,user_id,role,can_invite,joined_at) VALUES (?,?,'owner',1,?)",
        )
        .bind(roomId, userId, timestamp),
    );
  }
  if (!validInvitation)
    for (const [teamName, description, kind, accent] of DEFAULT_TEAMS)
      statements.push(
        db
          .prepare(
            'INSERT INTO teams (id,organization_id,name,description,kind,accent,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)',
          )
          .bind(
            crypto.randomUUID(),
            organizationId,
            teamName,
            description,
            kind,
            accent,
            userId,
            timestamp,
          ),
      );
  if (!validInvitation)
    for (const profileId of ['aarav', 'meera', 'kabir', 'ira'])
      statements.push(
        db
          .prepare(
            'INSERT INTO room_agents (room_id,profile_id,enabled,added_by,added_at) VALUES (?,?,1,?,?)',
          )
          .bind(roomId, profileId, userId, timestamp),
      );
  await db.batch(statements);
  const session = await createSession(userId);
  const safeReturn =
    returnTo.startsWith('/') && !returnTo.startsWith('//')
      ? returnTo
      : validInvitation
        ? `/invite/${inviteToken}`
        : '/rooms/payments-war-room';
  return Response.json(
    { redirectTo: safeReturn },
    { status: 201, headers: { 'Set-Cookie': session.cookie } },
  );
}
