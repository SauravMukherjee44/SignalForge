'use client';

import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import SignalForgeApp, {
  type WorkspaceContext,
} from '@/components/signalforge-app';

export function RoomGate({ slug }: { slug: string }) {
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void fetch(`/api/rooms/${encodeURIComponent(slug)}`)
      .then(async (r) => ({
        ok: r.ok,
        status: r.status,
        data: (await r.json()) as WorkspaceContext & { error?: string },
      }))
      .then(({ ok, status, data }) => {
        if (status === 401)
          return window.location.assign(
            `/signin?returnTo=${encodeURIComponent(`/rooms/${slug}`)}`,
          );
        if (!ok) throw new Error(data.error);
        setWorkspace(data);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'Unable to enter room'),
      );
  }, [slug]);
  if (error)
    return (
      <main className="gate-state">
        <ShieldState title="Access unavailable" text={error} />
      </main>
    );
  if (!workspace)
    return (
      <main className="gate-state">
        <LoaderCircle className="spin" />
        <p>Establishing your protected room session…</p>
      </main>
    );
  return <SignalForgeApp workspace={workspace} />;
}
function ShieldState({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h1>{title}</h1>
      <p>{text}</p>
      <a href="/rooms">Return to rooms</a>
    </div>
  );
}
