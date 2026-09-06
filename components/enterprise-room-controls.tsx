'use client';

import {
  Check,
  Copy,
  LoaderCircle,
  Search,
  UserPlus,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { UserAvatar } from '@/components/user-avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

type Room = {
  id: string;
  slug: string;
  name: string;
  canInvite: boolean;
  canManage: boolean;
};
type Directory = {
  people: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    inRoom: number;
    roomRole: string | null;
  }>;
  teams: Array<{
    id: string;
    name: string;
    description: string;
    kind: string;
    accent: string;
  }>;
  agents: Array<{ id: string; enabled: number }>;
};
export function EnterpriseRoomControls({
  room,
  organizationName,
}: {
  room: Room;
  organizationName: string;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [tab, setTab] = useState<'people' | 'teams' | 'email'>('people'),
    [data, setData] = useState<Directory>({
      people: [],
      teams: [],
      agents: [],
    }),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [inviteUrl, setInviteUrl] = useState('');
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(
      () =>
        void fetch(
          `/api/directory?roomId=${room.id}&q=${encodeURIComponent(query)}`,
        )
          .then((r) => r.json() as Promise<Directory>)
          .then(setData),
      180,
    );
    return () => clearTimeout(timer);
  }, [open, query, room.id]);
  async function invite(payload: Record<string, string>) {
    setBusy(true);
    setMessage('');
    const response = await fetch(`/api/rooms/${room.slug}/invites`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as {
      error?: string;
      invitePath?: string;
      status?: string;
    };
    setBusy(false);
    if (!response.ok) {
      setMessage(result.error || 'Invite failed');
      return;
    }
    if (result.invitePath)
      setInviteUrl(`${window.location.origin}${result.invitePath}`);
    setMessage(
      result.status === 'added'
        ? 'Responder added to this room.'
        : result.status === 'team-added'
          ? 'Team is now available in this room.'
          : 'Secure invite link created.',
    );
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="enterprise-side-actions">
        <button type="button" onClick={() => window.location.assign('/rooms')}>
          <Users size={16} />
          <span>
            <small>{organizationName}</small>
            <b>All response rooms</b>
          </span>
        </button>
        {(room.canInvite || room.canManage) && (
          <button onClick={() => setOpen(true)}>
            <UserPlus size={16} />
            <span>
              <small>ACCESS CONTROL</small>
              <b>Invite responders</b>
            </span>
          </button>
        )}
      </div>
      <DialogContent className="enterprise-modal invite-modal">
        <span className="section-kicker">
          <UserPlus size={14} /> Room access
        </span>
        <DialogTitle>Assemble the response team</DialogTitle>
        <DialogDescription>
          Invite a workspace member, an entire responder group, or create a
          time-limited email link.
        </DialogDescription>
        <div className="invite-tabs">
          <button
            className={tab === 'people' ? 'active' : ''}
            onClick={() => setTab('people')}
          >
            People
          </button>
          <button
            className={tab === 'teams' ? 'active' : ''}
            onClick={() => setTab('teams')}
          >
            Teams
          </button>
          <button
            className={tab === 'email' ? 'active' : ''}
            onClick={() => setTab('email')}
          >
            Email link
          </button>
        </div>
        {tab !== 'email' && (
          <label className="directory-search">
            <Search size={17} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${tab}`}
            />
          </label>
        )}
        <div className="directory-list">
          {tab === 'people' &&
            data.people.map((person) => (
              <button
                key={person.id}
                disabled={Boolean(person.inRoom) || busy}
                onClick={() =>
                  invite({
                    targetType: 'person',
                    targetId: person.id,
                    role: 'responder',
                  })
                }
              >
                <UserAvatar
                  name={person.name}
                  identity={person.email}
                  size="md"
                />
                <span>
                  <b>{person.name}</b>
                  <small>{person.email}</small>
                </span>
                <em>
                  {person.inRoom ? `In room · ${person.roomRole}` : 'Add'}
                </em>
              </button>
            ))}
          {tab === 'teams' &&
            data.teams.map((team) => (
              <button
                key={team.id}
                onClick={() =>
                  invite({
                    targetType: 'team',
                    targetId: team.id,
                    role: 'responder',
                  })
                }
              >
                <span className={`directory-avatar ${team.accent}`}>
                  <Users size={18} />
                </span>
                <span>
                  <b>{team.name}</b>
                  <small>{team.description}</small>
                </span>
                <em>{team.kind === 'agent' ? 'Activate' : 'Invite'}</em>
              </button>
            ))}
          {tab === 'email' && (
            <form
              className="secure-invite-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const email = f.get('email');
                const role = f.get('role');
                if (typeof email !== 'string' || typeof role !== 'string')
                  return;
                void invite({
                  targetType: 'email',
                  email,
                  role,
                });
              }}
            >
              <label>
                Work email
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="responder@company.com"
                />
              </label>
              <label>
                Room role
                <select name="role">
                  <option value="observer">Observer</option>
                  <option value="responder">Responder</option>
                  <option value="commander">Commander</option>
                </select>
              </label>
              <button
                className="auth-submit secure-invite-button"
                type="submit"
                disabled={busy}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <UserPlus size={17} />
                )}
                Create secure invite
              </button>
            </form>
          )}
        </div>
        {message && (
          <p className="invite-message">
            <Check size={15} />
            {message}
          </p>
        )}
        {inviteUrl && (
          <div className="invite-link">
            <input readOnly value={inviteUrl} />
            <button
              onClick={() => void navigator.clipboard.writeText(inviteUrl)}
            >
              <Copy size={16} />
              Copy
            </button>
          </div>
        )}
        <button className="modal-close" onClick={() => setOpen(false)}>
          Done
        </button>
      </DialogContent>
    </Dialog>
  );
}
