import { AuthForm } from '@/components/auth-form';

export default function SignUpPage() {
  return (
    <main className="auth-page signup-page">
      <a className="public-brand auth-brand" href="/">
        <img src="/visuals/signalforge-core.png" alt="" />
        <span><b>SignalForge</b><small>INCIDENT INTELLIGENCE</small></span>
      </a>
      <section className="auth-visual">
        <div className="auth-glow" />
        <img src="/visuals/signalforge-core.png" alt="" />
        <span className="eyebrow">YOUR INCIDENT CONTROL PLANE</span>
        <h1>Bring your response<br /><em>teams into focus.</em></h1>
        <p>Create protected rooms, assign operational roles, invite teams, and keep every decision connected to its evidence.</p>
        <div className="auth-proof"><span>✓</span> Private by default · Role scoped · Rate protected</div>
      </section>
      <section className="auth-panel">
        <div className="auth-panel-copy">
          <small>CREATE YOUR WORKSPACE</small>
          <h2>Start with verified identity</h2>
          <p>Your first room opens with the payment incident workspace, ready for your team.</p>
        </div>
        <AuthForm mode="signup" />
      </section>
    </main>
  );
}
