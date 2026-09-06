import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  LockKeyhole,
  RadioTower,
  ShieldCheck,
  Users,
} from 'lucide-react';

export default function LandingPage() {
  return (
    <main className="public-site">
      <div className="public-grid" />
      <header className="public-nav">
        <a className="public-brand" href="/" aria-label="SignalForge home">
          <img src="/visuals/signalforge-core.png" alt="" />
          <span>
            <b>SignalForge</b>
            <small>INCIDENT INTELLIGENCE</small>
          </span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#platform">Platform</a>
          <a href="#security">Security</a>
          <a href="https://signalforge-architecture.netlify.app/" target="_blank" rel="noreferrer">
            Architecture
          </a>
        </nav>
        <div className="public-actions">
          <a className="text-action" href="/signin">Sign in</a>
          <a className="primary-action" href="/signup">
            Create workspace <ArrowRight size={16} />
          </a>
        </div>
      </header>

      <section className="public-hero">
        <div className="hero-copy">
          <span className="eyebrow"><RadioTower size={15} /> LIVE INCIDENT OPERATIONS</span>
          <h1>Every incident room.<br /><em>One shared truth.</em></h1>
          <p>
            SignalForge turns live voice into verified operational state—facts,
            conflicts, decisions, owners, and the safest next move—without
            pretending uncertainty does not exist.
          </p>
          <div className="hero-actions">
            <a className="primary-action large" href="/signup">
              Start with your team <ArrowRight size={18} />
            </a>
            <a className="secondary-action large" href="/signin">
              Enter command center
            </a>
          </div>
          <div className="trust-line">
            <span><CheckCircle2 size={15} /> Role-based rooms</span>
            <span><CheckCircle2 size={15} /> Human-approved actions</span>
            <span><CheckCircle2 size={15} /> Auditable evidence</span>
          </div>
        </div>

        <div className="hero-visual" aria-label="SignalForge operational intelligence network">
          <div className="hero-orbit orbit-a" />
          <div className="hero-orbit orbit-b" />
          <img src="/visuals/signalforge-core.png" alt="" />
          <article className="floating-proof proof-fact">
            <ShieldCheck size={18} />
            <div><small>VERIFIED FACT</small><b>Gateway failures isolated to APAC-3</b></div>
          </article>
          <article className="floating-proof proof-team">
            <Users size={18} />
            <div><small>RESPONSE TEAM</small><b>6 responders · 4 specialist agents</b></div>
          </article>
          <article className="floating-proof proof-action">
            <LockKeyhole size={18} />
            <div><small>APPROVAL GATE</small><b>Traffic reroute requires commander</b></div>
          </article>
        </div>
      </section>

      <section className="capability-strip" id="platform">
        <article><BrainCircuit /><b>Evidence intelligence</b><span>Separates observation, inference, conflict, and open questions in real time.</span></article>
        <article><Users /><b>Team-aware command</b><span>Invite people, operational teams, or bounded AI responders into protected rooms.</span></article>
        <article><ShieldCheck /><b>Enterprise control</b><span>Authenticated accounts, role-scoped access, daily quotas, and human approval boundaries.</span></article>
      </section>

      <section className="security-banner" id="security">
        <span><LockKeyhole /></span>
        <div>
          <small>BUILT FOR CONTROLLED OPERATIONS</small>
          <h2>Intelligence that respects the chain of command.</h2>
          <p>Every room has an owner. Every member has a role. Every critical action has an explicit approval boundary.</p>
        </div>
        <a href="/signup">Create a protected workspace <ArrowRight size={17} /></a>
      </section>
    </main>
  );
}
