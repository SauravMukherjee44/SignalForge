'use client';

import {
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';

type AuthMode = 'signin' | 'signup';

export function AuthForm({ mode }: { mode: AuthMode }) {
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [returnTo, setReturnTo] = useState('');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInviteToken(params.get('invite') || '');
    setReturnTo(params.get('returnTo') || '');
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const payload = {
      ...Object.fromEntries(form.entries()),
      inviteToken,
      returnTo,
    };
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        error?: string;
        redirectTo?: string;
      };
      if (!response.ok)
        throw new Error(result.error || 'Authentication failed.');
      window.location.assign(result.redirectTo || '/rooms');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Authentication failed.',
      );
      setBusy(false);
    }
  }

  const signup = mode === 'signup';
  return (
    <form className="auth-form" onSubmit={submit}>
      {signup && (
        <div className="auth-field-row">
          <label>
            <span>Your name</span>
            <div>
              <UserRound size={17} />
              <input
                name="name"
                autoComplete="name"
                required
                placeholder="Saurav Mukherjee"
              />
            </div>
          </label>
          {!inviteToken && (
            <label>
              <span>Organization</span>
              <div>
                <Users size={17} />
                <input
                  name="organization"
                  autoComplete="organization"
                  required
                  placeholder="SignalForge Operations"
                />
              </div>
            </label>
          )}
        </div>
      )}
      <label>
        <span>Work email</span>
        <div>
          <Mail size={17} />
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
          />
        </div>
      </label>
      <label>
        <span>Password</span>
        <div>
          <LockKeyhole size={17} />
          <input
            type={showPassword ? 'text' : 'password'}
            name="password"
            autoComplete={signup ? 'new-password' : 'current-password'}
            minLength={12}
            required
            placeholder={signup ? '12+ characters' : 'Your password'}
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </label>
      {signup && (
        <p className="password-policy">
          <ShieldCheck size={14} /> Use 12+ characters with uppercase,
          lowercase, and a number.
        </p>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <button className="auth-submit" type="submit" disabled={busy}>
        {busy ? <LoaderCircle className="spin" size={18} /> : null}
        {signup ? 'Create protected workspace' : 'Sign in to SignalForge'}
        {!busy && <ArrowRight size={17} />}
      </button>
      <p className="auth-switch">
        {signup ? 'Already have a workspace?' : 'New to SignalForge?'}{' '}
        <a
          href={`${signup ? '/signin' : '/signup'}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}
        >
          {signup ? 'Sign in' : 'Create an account'}
        </a>
      </p>
    </form>
  );
}
