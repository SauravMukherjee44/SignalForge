'use client';

import {
  Activity,
  ArrowRight,
  Command,
  DoorOpen,
  LoaderCircle,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { UserAvatar } from '@/components/user-avatar';

type Room = {
  id: string;
  slug: string;
  name: string;
  description: string;
  severity: string;
  status: string;
  role: string;
  participantCount: number;
  agentCount: number;
};
type User = {
  email: string;
  displayName: string;
  organizationName: string;
  organizationRole: string;
};

export function RoomHub() {
  const [user, setUser] = useState<User | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    void fetch('/api/rooms')
      .then(async (r) => ({
        ok: r.ok,
        status: r.status,
        data: (await r.json()) as { error?: string; user: User; rooms: Room[] },
      }))
      .then(({ ok, status, data }) => {
        if (status === 401) return window.location.assign('/signin');
        if (!ok) throw new Error(data.error);
        setUser(data.user);
        setRooms(data.rooms);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'Unable to load rooms'),
      );
  }, []);
  const filtered = useMemo(
    () =>
      rooms.filter((room) =>
        `${room.name} ${room.description}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [rooms, query],
  );
  async function createRoom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = (await response.json()) as {
      error?: string;
      redirectTo?: string;
    };
    if (!response.ok) {
      setError(result.error || 'Unable to create room');
      setCreating(false);
      return;
    }
    window.location.assign(result.redirectTo!);
  }
  async function signOut() {
    await fetch('/api/auth/signout', { method: 'POST' });
    window.location.assign('/');
  }
  return (
    <main className="hub-shell">
      <header className="hub-topbar">
        <a className="public-brand" href="/">
          <span className="brand-orbit">
            <i />
          </span>
          <strong>SignalForge</strong>
        </a>
        <div className="hub-user">
          {user && (
            <UserAvatar
              name={user.displayName}
              identity={user.email}
              size="md"
            />
          )}
          <span>
            <strong>{user?.displayName || 'Loading…'}</strong>
            <small>{user?.organizationName}</small>
          </span>
          <button onClick={signOut} aria-label="Sign out">
            <LogOut size={17} />
          </button>
        </div>
      </header>
      <section className="hub-hero">
        <div>
          <span className="section-kicker">
            <ShieldCheck size={15} /> Verified operations workspace
          </span>
          <h1>
            Your incident
            <br />
            <em>command rooms.</em>
          </h1>
          <p>
            Create a protected response room, assemble the right human and AI
            teams, and preserve a reliable operational record.
          </p>
        </div>
        <button className="hub-create" onClick={() => setOpen(true)}>
          <Plus />
          Create response room
        </button>
      </section>
      <section className="hub-toolbar">
        <label>
          <Search size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search rooms, incidents, or services"
          />
        </label>
        <span>
          {filtered.length} accessible room{filtered.length === 1 ? '' : 's'}
        </span>
      </section>
      {error && <p className="auth-error">{error}</p>}
      <section className="room-grid">
        {filtered.map((room, index) => (
          <a className="room-card" href={`/rooms/${room.slug}`} key={room.id}>
            <div className="room-card-head">
              <span
                className={`severity-badge severity-${room.severity.slice(-1)}`}
              >
                {room.severity}
              </span>
              <span className="room-status">
                <i />
                {room.status}
              </span>
            </div>
            <div className="room-symbol">
              <Command />
            </div>
            <h2>{room.name}</h2>
            <p>
              {room.description || 'Protected live incident collaboration room'}
            </p>
            <div className="room-metrics">
              <span>
                <Users size={16} />
                {room.participantCount} members
              </span>
              <span>
                <Activity size={16} />
                {room.agentCount} AI responders
              </span>
            </div>
            <footer>
              <span>{room.role}</span>
              <ArrowRight />
            </footer>
          </a>
        ))}
        {!filtered.length && user && (
          <div className="empty-room">
            <DoorOpen />
            <h2>No rooms match your search</h2>
            <p>Create a response room or clear the search.</p>
          </div>
        )}
      </section>
      {open && (
        <div
          className="enterprise-modal-backdrop"
          onMouseDown={() => setOpen(false)}
        >
          <form
            className="enterprise-modal"
            onSubmit={createRoom}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span className="section-kicker">
              <Plus size={15} /> New protected room
            </span>
            <h2>Open an incident workspace</h2>
            <label>
              Room name
              <input
                name="name"
                required
                minLength={3}
                placeholder="Checkout latency — APAC"
              />
            </label>
            <label>
              Operational context
              <textarea
                name="description"
                placeholder="What is affected and what the response team knows so far"
              />
            </label>
            <label>
              Initial severity
              <select name="severity" defaultValue="SEV-2">
                <option>SEV-1</option>
                <option>SEV-2</option>
                <option>SEV-3</option>
                <option>SEV-4</option>
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="auth-submit" disabled={creating}>
                {creating && <LoaderCircle className="spin" size={17} />}Create
                room
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
