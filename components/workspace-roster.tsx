'use client';

import {
  Check,
  Copy,
  LoaderCircle,
  Search,
  UserPlus,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { UserAvatar } from '@/components/user-avatar';

type Person = {
  id: string;
  name: string;
  email: string;
  role: string;
  inRoom: number;
  roomRole: string | null;
};
type Team = {
  id: string;
  name: string;
  description: string;
  kind: string;
  accent: string;
};
type Directory = { people: Person[]; teams: Team[] };

export function WorkspaceRoster({
  room,
}: {
  room: {
    id: string;
    slug: string;
    canInvite: boolean;
    canManage: boolean;
  };
}) {
  const [query, setQuery] = useState('');
  const [directory, setDirectory] = useState<Directory>({
    people: [],
    teams: [],
  });
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState('');
  const [notice, setNotice] = useState('');
  const canInvite = Boolean(room.canInvite || room.canManage);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(
      `/api/directory?roomId=${encodeURIComponent(room.id)}&q=${encodeURIComponent(query)}`,
    );
    if (response.ok) setDirectory((await response.json()) as Directory);
    setLoading(false);
  }, [query, room.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function addTarget(targetType: 'person' | 'team', targetId: string) {
    if (!canInvite) return;
    setPending(targetId);
    setNotice('');
    const response = await fetch(`/api/rooms/${room.slug}/invites`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetType, targetId, role: 'responder' }),
    });
    const result = (await response.json()) as { error?: string };
    setPending('');
    if (!response.ok) {
      setNotice(result.error || 'Unable to add that responder.');
      return;
    }
    setNotice(
      targetType === 'team'
        ? 'Responder group added.'
        : 'Team member added to this room.',
    );
    await load();
  }

  async function copyInvite() {
    if (!canInvite) return;
    setPending('share-link');
    setNotice('');
    const response = await fetch(`/api/rooms/${room.slug}/invites`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetType: 'link', role: 'responder' }),
    });
    const result = (await response.json()) as {
      error?: string;
      invitePath?: string;
    };
    setPending('');
    if (!response.ok || !result.invitePath) {
      setNotice(result.error || 'Unable to create an invite link.');
      return;
    }
    await navigator.clipboard.writeText(
      `${window.location.origin}${result.invitePath}`,
    );
    setNotice('Secure responder link copied. It expires in seven days.');
  }

  return (
    <div className="workspace-roster">
      <div className="roster-heading">
        <div>
          <span className="eyebrow">
            <Users size={14} /> WORKSPACE DIRECTORY
          </span>
          <h3>People and responder groups</h3>
          <p>
            Search your organization and bring the right humans into this room.
          </p>
        </div>
        {canInvite && (
          <button
            className="copy-room-invite"
            onClick={() => void copyInvite()}
            disabled={pending === 'share-link'}
          >
            {pending === 'share-link' ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Copy size={16} />
            )}
            Copy room invite
          </button>
        )}
      </div>
      <label className="roster-search">
        <Search size={18} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search people or teams by name, role, or email"
        />
        {loading && <LoaderCircle className="spin" size={16} />}
      </label>
      <div className="human-roster-grid">
        {directory.people.map((person) => (
          <article className="human-responder" key={person.id}>
            <UserAvatar name={person.name} identity={person.email} size="md" />
            <div>
              <b>{person.name}</b>
              <span>{person.roomRole || person.role}</span>
              <small>{person.email}</small>
            </div>
            <button
              disabled={
                !canInvite || Boolean(person.inRoom) || pending === person.id
              }
              onClick={() => void addTarget('person', person.id)}
            >
              {pending === person.id ? (
                <LoaderCircle className="spin" size={15} />
              ) : person.inRoom ? (
                <Check size={15} />
              ) : (
                <UserPlus size={15} />
              )}
              {person.inRoom ? 'In room' : 'Add'}
            </button>
          </article>
        ))}
      </div>
      {directory.teams.length > 0 && (
        <div className="responder-groups">
          {directory.teams.map((team) => (
            <button
              key={team.id}
              disabled={!canInvite || pending === team.id}
              onClick={() => void addTarget('team', team.id)}
            >
              <span className={`group-symbol ${team.accent}`}>
                <Users size={16} />
              </span>
              <span>
                <b>{team.name}</b>
                <small>{team.description}</small>
              </span>
              <em>{team.kind === 'agent' ? 'Activate' : 'Add team'}</em>
            </button>
          ))}
        </div>
      )}
      {!loading && !directory.people.length && !directory.teams.length && (
        <p className="roster-empty">
          No workspace members or responder groups match “{query}”.
        </p>
      )}
      {notice && (
        <p className="roster-notice">
          <Check size={15} />
          {notice}
        </p>
      )}
    </div>
  );
}
