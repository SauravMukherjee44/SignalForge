'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  IAgoraRTCClient,
  IMicrophoneAudioTrack,
  UID,
} from 'agora-rtc-sdk-ng';

export type RoomState = 'idle' | 'connecting' | 'connected' | 'error';

export type IncidentStreamMessage = {
  id: string;
  kind: 'transcript' | 'profile';
  speaker: string;
  text?: string;
  sentAt: string;
  uid?: string;
  role?: string;
};

export type ParticipantIdentity = { name: string; role: string };

export type LiveParticipant = ParticipantIdentity & {
  uid: UID;
  profileReady: boolean;
};

const normalizeAgoraChannel = (value: string) =>
  value
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 64);

type SignalForgePeerConnectionPrototype = RTCPeerConnection & {
  __signalForgeAgoraSdpFix?: boolean;
};

/**
 * Newer Chromium builds append `goog-sped-v1` to `a=ice-options`. Agora Web
 * SDK 4.24.8 rejects the second token even though it is an optional extension.
 * Remove only that token while retaining the standard `trickle` capability.
 */
function installAgoraSdpCompatibilityFix() {
  const peerConnection = window.RTCPeerConnection;
  if (!peerConnection) return;
  const prototype =
    peerConnection.prototype as SignalForgePeerConnectionPrototype;
  if (prototype.__signalForgeAgoraSdpFix) return;

  type CreateOffer = (
    this: RTCPeerConnection,
    options?: RTCOfferOptions,
  ) => Promise<RTCSessionDescriptionInit>;
  const createOffer = Reflect.get(prototype, 'createOffer') as CreateOffer;
  const patchedCreateOffer: CreateOffer = function (options) {
    return createOffer.call(this, options).then((offer) =>
      offer.sdp?.includes('goog-sped-v1')
        ? {
            type: offer.type,
            sdp: offer.sdp.replace(/ goog-sped-v1(?=\r?\n| )/g, ''),
          }
        : offer,
    );
  };
  Reflect.set(prototype, 'createOffer', patchedCreateOffer);
  prototype.__signalForgeAgoraSdpFix = true;
}

export function useAgoraRoom(
  appId: string,
  identity: ParticipantIdentity,
  initialChannel = 'payments-war-room',
) {
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const microphoneRef = useRef<IMicrophoneAudioTrack | null>(null);
  const uidRef = useRef<UID | null>(null);
  const identityRef = useRef(identity);
  const [state, setState] = useState<RoomState>('idle');
  const [channel, setChannel] = useState(normalizeAgoraChannel(initialChannel));
  const [uid, setUid] = useState<UID | null>(null);
  const [remoteUsers, setRemoteUsers] = useState<UID[]>([]);
  const [activeSpeaker, setActiveSpeaker] = useState<UID | null>(null);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'unknown' | 'app-id-only' | 'token'>(
    'unknown',
  );
  const [messages, setMessages] = useState<IncidentStreamMessage[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ParticipantIdentity>>(
    {},
  );

  useEffect(() => {
    identityRef.current = identity;
  }, [identity]);

  const sendChannelMessage = useCallback(
    async (message: IncidentStreamMessage) => {
      if (clientRef.current?.connectionState !== 'CONNECTED') return;
      const dataClient = clientRef.current as IAgoraRTCClient & {
        sendStreamMessage: (message: {
          payload: Uint8Array;
          syncWithAudio?: boolean;
        }) => Promise<void>;
      };
      try {
        await dataClient.sendStreamMessage({
          payload: new TextEncoder().encode(JSON.stringify(message)),
          syncWithAudio: message.kind === 'transcript',
        });
      } catch {
        // The connection can close after the state check during leave/HMR.
        // Profile and transcript messages remain represented in local state.
      }
    },
    [],
  );

  const broadcastProfile = useCallback(async () => {
    if (uidRef.current === null) return;
    const current = identityRef.current;
    await sendChannelMessage({
      id: crypto.randomUUID(),
      kind: 'profile',
      speaker: current.name.trim() || 'Responder',
      role: current.role.trim() || 'Responder',
      uid: String(uidRef.current),
      sentAt: new Date().toISOString(),
    });
  }, [sendChannelMessage]);

  const leave = useCallback(async () => {
    microphoneRef.current?.stop();
    microphoneRef.current?.close();
    microphoneRef.current = null;
    if (clientRef.current) {
      clientRef.current.removeAllListeners();
      await clientRef.current.leave();
      clientRef.current = null;
    }
    setState('idle');
    setUid(null);
    uidRef.current = null;
    setRemoteUsers([]);
    setProfiles({});
    setActiveSpeaker(null);
    setMuted(false);
  }, []);

  useEffect(
    () => () => {
      void leave();
    },
    [leave],
  );

  const join = useCallback(
    async (options?: { startMuted?: boolean }) => {
      if (!appId || state === 'connecting' || state === 'connected') return;
      setState('connecting');
      setError(null);
      try {
        const normalizedAppId = appId.trim();
        const normalizedChannel = normalizeAgoraChannel(channel);
        if (!/^[A-Fa-f0-9]{32}$/.test(normalizedAppId)) {
          throw new Error(
            'The Agora App ID must be a 32-character hexadecimal value.',
          );
        }
        if (!normalizedChannel) {
          throw new Error(
            'Enter a room name using letters, numbers, hyphens, or underscores.',
          );
        }
        if (normalizedChannel !== channel) setChannel(normalizedChannel);

        installAgoraSdpCompatibilityFix();

        const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
        AgoraRTC.setLogLevel(1);
        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        clientRef.current = client;

        client.on('user-published', async (user, mediaType) => {
          try {
            await client.subscribe(user, mediaType);
            if (mediaType === 'audio') user.audioTrack?.play();
          } catch (subscriptionError) {
            // A responder can publish while the page is leaving or Vite is
            // reconnecting during development. Keep that race contained and
            // give the operator a recoverable message instead of an unhandled
            // promise rejection overlay.
            if (client.connectionState === 'CONNECTED') {
              setError(
                subscriptionError instanceof Error
                  ? `A responder joined, but its audio could not start: ${subscriptionError.message}`
                  : 'A responder joined, but its audio could not start. Restart the response team.',
              );
            }
          } finally {
            setRemoteUsers(client.remoteUsers.map((item) => item.uid));
          }
        });
        client.on('user-joined', () => {
          setRemoteUsers(client.remoteUsers.map((item) => item.uid));
          window.setTimeout(() => void broadcastProfile(), 250);
        });
        client.on('user-left', () =>
          setRemoteUsers(client.remoteUsers.map((item) => item.uid)),
        );
        client.on('user-unpublished', () =>
          setRemoteUsers(client.remoteUsers.map((item) => item.uid)),
        );
        client.on('volume-indicator', (volumes) => {
          const loudest = [...volumes].sort((a, b) => b.level - a.level)[0];
          setActiveSpeaker(loudest && loudest.level > 8 ? loudest.uid : null);
        });
        client.on('stream-message', (_senderUid, payload) => {
          try {
            const text = new TextDecoder().decode(payload);
            const message = JSON.parse(text) as IncidentStreamMessage;
            if (message.kind === 'transcript') {
              setMessages((current) => [...current.slice(-49), message]);
            }
            if (message.kind === 'profile' && message.uid) {
              setProfiles((current) => ({
                ...current,
                [message.uid!]: {
                  name: message.speaker,
                  role: message.role || 'Responder',
                },
              }));
            }
          } catch {
            // Ignore non-SignalForge channel messages.
          }
        });
        client.enableAudioVolumeIndicator();

        const tokenResponse = await fetch(
          `/api/agora-token?channel=${encodeURIComponent(normalizedChannel)}&uid=0`,
        );
        const tokenPayload = (await tokenResponse.json()) as {
          token?: string | null;
          mode?: 'app-id-only' | 'token';
          uid?: number;
          error?: string;
        };
        if (!tokenResponse.ok) {
          throw new Error(
            tokenPayload.error || 'Unable to create an Agora token.',
          );
        }
        setAuthMode(tokenPayload.mode ?? 'unknown');
        const rtcToken =
          typeof tokenPayload.token === 'string'
            ? tokenPayload.token.trim()
            : null;
        const tokenUid =
          tokenPayload.mode === 'token' &&
          Number.isInteger(tokenPayload.uid) &&
          Number(tokenPayload.uid) > 0
            ? Number(tokenPayload.uid)
            : null;
        const assignedUid = await client.join(
          normalizedAppId,
          normalizedChannel,
          rtcToken,
          tokenUid,
        );
        const microphone = await AgoraRTC.createMicrophoneAudioTrack({
          encoderConfig: 'speech_standard',
          AEC: true,
          ANS: true,
          AGC: true,
        });
        if (options?.startMuted) await microphone.setMuted(true);
        microphoneRef.current = microphone;
        await client.publish(microphone);
        setUid(assignedUid);
        uidRef.current = assignedUid;
        setMuted(Boolean(options?.startMuted));
        setState('connected');
        const currentIdentity = identityRef.current;
        setProfiles((current) => ({
          ...current,
          [String(assignedUid)]: currentIdentity,
        }));
        await sendChannelMessage({
          id: crypto.randomUUID(),
          kind: 'profile',
          speaker: currentIdentity.name.trim() || 'Responder',
          role: currentIdentity.role.trim() || 'Responder',
          uid: String(assignedUid),
          sentAt: new Date().toISOString(),
        });
      } catch (cause) {
        const rawMessage =
          cause instanceof Error
            ? cause.message
            : 'Unable to join the Agora room.';
        const message =
          /dynamic use static key|CAN_NOT_GET_GATEWAY_SERVER/i.test(rawMessage)
            ? 'This Agora project requires token authentication. Add AGORA_APP_CERTIFICATE to .env.local and restart the server.'
            : /invalid space/i.test(rawMessage)
              ? 'Agora rejected a room connection parameter. The room name was cleaned automatically; refresh once and try joining again.'
              : rawMessage;
        setError(message);
        setState('error');
        await leave();
        setState('error');
      }
    },
    [appId, broadcastProfile, channel, leave, sendChannelMessage, state],
  );

  useEffect(() => {
    if (state !== 'connected' || uid === null) return;
    void broadcastProfile();
  }, [broadcastProfile, identity, state, uid]);

  const toggleMute = useCallback(async () => {
    if (!microphoneRef.current) return;
    const nextMuted = !muted;
    await microphoneRef.current.setMuted(nextMuted);
    setMuted(nextMuted);
  }, [muted]);

  const sendTranscript = useCallback(
    async (speaker: string, text: string) => {
      const message: IncidentStreamMessage = {
        id: crypto.randomUUID(),
        kind: 'transcript',
        speaker,
        text,
        sentAt: new Date().toISOString(),
        uid: uid === null ? undefined : String(uid),
      };
      setMessages((current) => [...current.slice(-49), message]);
      await sendChannelMessage(message);
      return message;
    },
    [sendChannelMessage, uid],
  );

  const ingestTranscript = useCallback((message: IncidentStreamMessage) => {
    if (message.kind !== 'transcript' || !message.text) return;
    const text = message.text;
    setMessages((current) =>
      current.some(
        (item) =>
          item.id === message.id ||
          (item.speaker === message.speaker &&
            (item.text === text ||
              item.text?.startsWith(text) ||
              text.startsWith(item.text ?? ''))),
      )
        ? current
        : [...current.slice(-49), { ...message, text }],
    );
  }, []);

  const participants: LiveParticipant[] = [
    ...(state === 'connected' && uid !== null
      ? [
          {
            uid,
            name: profiles[String(uid)]?.name ?? identity.name,
            role: profiles[String(uid)]?.role ?? identity.role,
            profileReady: true,
          },
        ]
      : []),
    ...remoteUsers.map((remoteUid) => ({
      uid: remoteUid,
      name: profiles[String(remoteUid)]?.name ?? 'Joining…',
      role: profiles[String(remoteUid)]?.role ?? 'Profile syncing',
      profileReady: Boolean(profiles[String(remoteUid)]),
    })),
  ];

  return {
    state,
    channel,
    setChannel,
    uid,
    remoteUsers,
    activeSpeaker,
    muted,
    error,
    authMode,
    messages,
    participants,
    join,
    leave,
    toggleMute,
    sendTranscript,
    ingestTranscript,
  };
}
