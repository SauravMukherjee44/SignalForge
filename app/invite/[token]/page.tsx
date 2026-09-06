'use client';
import { ArrowRight, LoaderCircle, ShieldCheck, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
export default function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [token, setToken] = useState(''),
    [invite, setInvite] = useState<Record<string, string> | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    void params
      .then(({ token: t }) => {
        setToken(t);
        return Promise.all([
          fetch(`/api/invitations/${t}`).then(
            (r) =>
              r.json() as Promise<{
                error?: string;
                invite: Record<string, string>;
              }>,
          ),
          fetch('/api/auth/me'),
        ]);
      })
      .then(([data, me]) => {
        if (data.error) throw new Error(data.error);
        setInvite(data.invite);
        setSignedIn(me.ok);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'Invite unavailable'),
      );
  }, [params]);
  async function accept() {
    setBusy(true);
    const r = await fetch(`/api/invitations/${token}`, { method: 'POST' });
    const d = (await r.json()) as { error?: string; redirectTo?: string };
    if (!r.ok) {
      setError(d.error || 'Unable to accept invite');
      setBusy(false);
      return;
    }
    window.location.assign(d.redirectTo!);
  }
  return (
    <main className="auth-shell">
      <section className="auth-visual">
        <a className="public-brand" href="/">
          <span className="brand-orbit">
            <i />
          </span>
          <strong>SignalForge</strong>
        </a>
        <div className="auth-visual-copy">
          <span className="section-kicker">
            <ShieldCheck size={15} /> Controlled room access
          </span>
          <h1>
            The right team.
            <br />
            <em>The right context.</em>
          </h1>
          <p>
            Every invitation is scoped to an organization, a response room, and
            an explicit operational role.
          </p>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-card-icon">
            <UserPlus />
          </div>
          <span className="section-kicker">Response invitation</span>
          <h2>{invite?.roomName || 'Loading invitation…'}</h2>
          {invite && (
            <>
              <p>
                <strong>{invite.invitedBy}</strong> invited you to{' '}
                {invite.organizationName} as a{' '}
                <strong>{invite.roomRole}</strong>.
              </p>
              <p className="invite-recipient">Issued to {invite.email}</p>
            </>
          )}
          {error && <p className="auth-error">{error}</p>}
          {invite &&
            !error &&
            (signedIn ? (
              <button className="auth-submit" onClick={accept} disabled={busy}>
                {busy ? <LoaderCircle className="spin" /> : null}Accept and
                enter room
                <ArrowRight />
              </button>
            ) : (
              <div className="invite-auth-actions">
                <a
                  className="auth-submit"
                  href={`/signin?returnTo=${encodeURIComponent(`/invite/${token}`)}`}
                >
                  Sign in to accept
                  <ArrowRight />
                </a>
                <a
                  href={`/signup?invite=${encodeURIComponent(token)}&returnTo=${encodeURIComponent(`/invite/${token}`)}`}
                >
                  Create a verified account
                </a>
              </div>
            ))}
        </div>
      </section>
    </main>
  );
}
