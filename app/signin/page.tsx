import { AuthForm } from '@/components/auth-form';

export default function SignInPage() {
  return <AuthPage mode="signin" />;
}

function AuthPage({ mode }: { mode: 'signin' | 'signup' }) {
  return (
    <main className="auth-page">
      <a className="public-brand auth-brand" href="/">
        <img src="/visuals/signalforge-core.png" alt="" />
        <span><b>SignalForge</b><small>INCIDENT INTELLIGENCE</small></span>
      </a>
      <section className="auth-visual">
        <div className="auth-glow" />
        <img src="/visuals/signalforge-core.png" alt="" />
        <span className="eyebrow">SECURE OPERATIONS ACCESS</span>
        <h1>Return to your<br /><em>incident command.</em></h1>
        <p>Your rooms, evidence, teams, and decisions remain protected by organization and room-level access policies.</p>
        <div className="auth-proof"><ShieldMini /> Authenticated access · Sessions protected · Actions auditable</div>
      </section>
      <section className="auth-panel">
        <div className="auth-panel-copy">
          <small>WELCOME BACK</small>
          <h2>Sign in to continue</h2>
          <p>Authentication is required only when you enter or operate an incident room.</p>
        </div>
        <AuthForm mode={mode} />
      </section>
    </main>
  );
}

function ShieldMini() {
  return <span aria-hidden="true">✓</span>;
}
