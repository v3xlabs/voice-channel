import { createContext, createEffect, createSignal, onCleanup, useContext, type Accessor, type ParentComponent } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import { JID, type Agent } from 'stanza';
import type { MediaSession } from 'stanza/jingle';
import { createMediaController, type MediaController } from './media';
import type { ReceivedMessage, ReceivedMUCPresence, MAMFin, DiscoItemsResult } from 'stanza/protocol';
import { useAuth } from '../auth/provider';
import { GUILDS_NODE, guildChannels, guildNode, isGuildManifest, type GuildChannel, type GuildManifest } from '../xmpp/guild';
import type { VoiceState } from '../xmpp/voice';

export type CallState = {
    preparing: boolean;
    voice: VoiceState;
};

/**
 * One nick can be several devices of one account, and each device sends its own room
 * presence. Call state is kept per device, so an idle device cannot hide an active one.
 */
export type Occupant = {
    nick: string;
    jid?: string;
    affiliation?: string;
    role?: string;
    /** Per device (full JID, or the nick when the room hides JIDs), XEP-0272 call state if in the call. */
    devices: Record<string, CallState | undefined>;
    /** The call state of the device that is in the call, if any. */
    call?: CallState;
};

/** Our own call in one voice room. */
export type OwnCall = {
    roomJid: string;
    stage: 'preparing' | 'ready';
    voice: VoiceState;
};

const DEFAULT_VOICE: VoiceState = { muted: false, deafened: false, camera: false, screen: false };
const OFFERED_CONTENTS = [{ name: 'audio', media: 'audio' as const }];
/**
 * Prosody shows other occupants only one presence per nick, that of the first device to join.
 * A device that joins a call therefore takes its own nick for the duration, and occupants are
 * grouped by account so the person still appears once.
 */
const CALL_NICK_SUFFIX = ' (voice)';
const baseNick = (nick: string) => (nick.endsWith(CALL_NICK_SUFFIX) ? nick.slice(0, -CALL_NICK_SUFFIX.length) : nick);

export type RoomMessage = {
    id: string;
    nick: string;
    body: string;
    timestamp: number;
    ownMessage: boolean;
};

export type RoomState = {
    joined: boolean;
    occupants: Record<string, Occupant>;
    messages: RoomMessage[];
    hasOlder: boolean;
    mamBefore?: string;
};

type GuildContextType = {
    guilds: Accessor<GuildManifest[]>;
    guild: (slug: string) => GuildManifest | undefined;
    channel: (slug: string, name: string) => GuildChannel | undefined;
    room: (roomJid: string) => RoomState | undefined;
    ownNick: Accessor<string>;
    /** Own bare JID, the key occupants are grouped by. */
    ownJid: Accessor<string>;
    loadLatestHistory: (roomJid: string, max?: number) => Promise<void>;
    loadOlderHistory: (roomJid: string, max?: number) => Promise<void>;
    sendRoomMessage: (roomJid: string, body: string) => Promise<void>;
    /** Command nodes the daemon lists for this account; instance admins see the instance ones. */
    commands: Accessor<string[]>;
    isInstanceAdmin: Accessor<boolean>;
    /** Own affiliation in a guild, from our presence in its first room. */
    ownAffiliation: (slug: string) => string | undefined;
    call: Accessor<OwnCall | undefined>;
    media: MediaController;
    joinCall: (roomJid: string) => void;
    leaveCall: () => void;
    setVoiceState: (patch: Partial<VoiceState>) => void;
};

const GuildContext = createContext<GuildContextType>();

const emptyRoom = (): RoomState => ({ joined: false, occupants: {}, messages: [], hasOlder: false });

const messageId = (msg: ReceivedMessage): string =>
    msg.stanzaIds?.[0]?.id ?? msg.id ?? `${msg.from}-${msg.delay?.timestamp?.getTime() ?? Date.now()}`;

const findPubsubService = async (c: Agent, domain: string): Promise<string | undefined> => {
    const items: DiscoItemsResult = await c.getDiscoItems(domain);
    for (const item of items.items ?? []) {
        if (!item.jid) continue;
        const info = await c.getDiscoInfo(item.jid);
        const isPubsub = info.identities?.some((identity) => identity.category === 'pubsub' && identity.type === 'service');
        if (isPubsub) return item.jid;
    }
    return undefined;
};

const isItemNotFound = (error: unknown): boolean =>
    (error as { error?: { condition?: string } })?.error?.condition === 'item-not-found';

/** An instance without vcd has no guild list node. That is not an error, it is zero guilds. */
const fetchManifests = async (c: Agent, pubsubJid: string): Promise<GuildManifest[]> => {
    const list = await c.getItems(pubsubJid, GUILDS_NODE).catch((error: unknown) => {
        if (isItemNotFound(error)) return { items: [] };
        throw error;
    });
    const manifests: GuildManifest[] = [];
    for (const item of list.items ?? []) {
        if (!isGuildManifest(item.content)) continue;
        const full = await c.getItems(pubsubJid, guildNode(item.content.slug), { max: 1 });
        const content = full.items?.[0]?.content;
        if (isGuildManifest(content)) manifests.push(content);
    }
    return manifests;
};

export const GuildProvider: ParentComponent = (props) => {
    const { client, hasSession, jid } = useAuth();
    const [state, setState] = createStore<{ guilds: GuildManifest[]; rooms: Record<string, RoomState> }>({
        guilds: [],
        rooms: {},
    });

    const ownNick = () => JID.getLocal(jid() ?? '') ?? 'me';
    const ownJid = () => JID.toBare(jid() ?? '');
    const callNick = () => `${ownNick()}${CALL_NICK_SUFFIX}`;

    const ensureRoom = (roomJid: string) => {
        if (!state.rooms[roomJid]) setState('rooms', roomJid, emptyRoom());
    };

    const appendMessage = (roomJid: string, message: RoomMessage, position: 'end' | 'start') => {
        ensureRoom(roomJid);
        setState(
            'rooms',
            roomJid,
            'messages',
            produce((messages) => {
                if (messages.some((existing) => existing.id === message.id)) return;
                if (position === 'end') messages.push(message);
                else messages.unshift(message);
            })
        );
    };

    const toRoomMessage = (msg: ReceivedMessage): RoomMessage | undefined => {
        const body = msg.body?.trim();
        const nick = JID.getResource(msg.from);
        if (!body || !nick) return undefined;
        return {
            id: messageId(msg),
            nick: baseNick(nick),
            body,
            timestamp: msg.delay?.timestamp?.getTime() ?? Date.now(),
            ownMessage: baseNick(nick) === ownNick(),
        };
    };

    const applyHistory = (roomJid: string, result: MAMFin, mode: 'latest' | 'older') => {
        const messages = (result.results ?? [])
            .map((entry) => entry.item.message)
            .filter((msg): msg is ReceivedMessage => msg !== undefined)
            .map((msg) => toRoomMessage({ ...msg, delay: msg.delay }))
            .filter((msg): msg is RoomMessage => msg !== undefined);
        for (const message of mode === 'latest' ? messages : [...messages].reverse()) {
            appendMessage(roomJid, message, mode === 'latest' ? 'end' : 'start');
        }
        const first = result.paging?.first;
        setState('rooms', roomJid, {
            mamBefore: first,
            hasOlder: result.complete !== true && Boolean(first),
        });
    };

    const loadLatestHistory = async (roomJid: string, max = 50) => {
        const c = client();
        if (!c || !hasSession()) return;
        ensureRoom(roomJid);
        const result = await c.searchHistory(roomJid, { paging: { max } });
        applyHistory(roomJid, result, 'latest');
    };

    const loadOlderHistory = async (roomJid: string, max = 50) => {
        const c = client();
        const before = state.rooms[roomJid]?.mamBefore;
        if (!c || !hasSession() || !before) return;
        const result = await c.searchHistory(roomJid, { paging: { max, before } });
        applyHistory(roomJid, result, 'older');
    };

    const sendRoomMessage = async (roomJid: string, body: string) => {
        const c = client();
        const trimmed = body.trim();
        if (!c || !trimmed) return;
        c.sendMessage({ to: roomJid, type: 'groupchat', body: trimmed });
    };

    const [commands, setCommands] = createSignal<string[]>([]);
    const isInstanceAdmin = () => commands().includes('urn:voice.channel:instance#invite');
    const ownAffiliation = (slug: string) => {
        const first = state.guilds.find((guild) => guild.slug === slug)?.categories[0]?.channels[0];
        if (!first) return undefined;
        return Object.values(state.rooms[first.jid]?.occupants ?? {}).find((occupant) => occupant.jid === ownJid())?.affiliation;
    };

    const [call, setCall] = createSignal<OwnCall | undefined>(undefined);
    const media = createMediaController(client);

    const conferenceFor = (roomJid: string) =>
        state.guilds.flatMap(guildChannels).find((channel) => channel.jid === roomJid)?.conference;

    /**
     * Room presence carrying our call state. Without `muji` it means "in the room, not in the call".
     * Several devices of one account share a nick, and the room shows others only the presence of
     * the highest-priority device, so the device in the call raises its priority.
     */
    const sendCallPresence = (roomJid: string, stage: OwnCall['stage'] | 'none', voice: VoiceState) => {
        const c = client();
        if (!c) return;
        c.sendPresence({
            to: `${roomJid}/${stage === 'none' ? ownNick() : callNick()}`,
            ...(stage === 'none'
                ? {}
                : {
                      muji: { preparing: stage === 'preparing', contents: stage === 'ready' ? OFFERED_CONTENTS : [] },
                      voiceState: voice,
                  }),
        });
    };

    const joinCall = (roomJid: string) => {
        if (call()) leaveCall();
        setCall({ roomJid, stage: 'preparing', voice: DEFAULT_VOICE });
        sendCallPresence(roomJid, 'preparing', DEFAULT_VOICE);
    };

    const leaveCall = () => {
        const current = call();
        if (!current) return;
        setCall(undefined);
        media.stop();
        sendCallPresence(current.roomJid, 'none', current.voice);
    };

    const setVoiceState = (patch: Partial<VoiceState>) => {
        const current = call();
        if (!current) return;
        const voice = { ...current.voice, ...patch, ...(patch.deafened ? { muted: true } : {}) };
        setCall({ ...current, voice });
        media.setMuted(voice.muted);
        if (patch.camera !== undefined) void media.setCamera(patch.camera).catch((error: unknown) => console.warn('camera', error));
        if (patch.screen !== undefined) void media.setScreen(patch.screen).catch((error: unknown) => console.warn('screen', error));
        sendCallPresence(current.roomJid, current.stage, voice);
    };

    /** XEP-0272 section 5: after the room echoes our `preparing`, announce what we offer. */
    const onOwnEcho = (roomJid: string, presence: ReceivedMUCPresence) => {
        const current = call();
        if (!current || current.roomJid !== roomJid || current.stage !== 'preparing') return;
        if (!presence.muji?.preparing) return;
        setCall({ ...current, stage: 'ready' });
        sendCallPresence(roomJid, 'ready', current.voice);
        const conference = conferenceFor(roomJid);
        if (conference) void media.start(conference, current.voice.muted).catch((error: unknown) => console.warn('Could not start media', error));
    };

    const joinRooms = async (c: Agent, guilds: GuildManifest[]) => {
        for (const guild of guilds) {
            for (const channel of guildChannels(guild)) {
                ensureRoom(channel.jid);
                try {
                    await c.joinRoom(channel.jid, ownNick(), { muc: { type: 'join', history: { maxStanzas: 0 } } });
                    setState('rooms', channel.jid, 'joined', true);
                } catch (error) {
                    console.warn('Failed to join room', channel.jid, error);
                }
            }
        }
    };

    createEffect(() => {
        const c = client();
        const ready = hasSession();
        const ownJid = jid();
        if (!c || !ready || !ownJid) return;

        const onPresence = (presence: ReceivedMUCPresence) => {
            const roomJid = JID.toBare(presence.from);
            const nick = JID.getResource(presence.from);
            if (!nick || !state.rooms[roomJid]) return;
            const bare = presence.muc.jid ? JID.toBare(presence.muc.jid) : undefined;
            const key = bare ?? baseNick(nick);
            const device = presence.muc.jid ?? nick;
            const callState: CallState | undefined = presence.muji
                ? { preparing: presence.muji.preparing, voice: presence.voiceState ?? DEFAULT_VOICE }
                : undefined;
            setState('rooms', roomJid, 'occupants', produce((occupants) => {
                const existing = occupants[key];
                const devices = { ...(existing?.devices ?? {}) };
                if (presence.type === 'unavailable') delete devices[device];
                else devices[device] = callState;
                if (Object.keys(devices).length === 0) {
                    delete occupants[key];
                    return;
                }
                occupants[key] = {
                    nick: baseNick(nick),
                    jid: bare ?? existing?.jid,
                    affiliation: presence.muc.affiliation ?? existing?.affiliation,
                    role: presence.muc.role ?? existing?.role,
                    devices,
                    call: Object.values(devices).find((state) => state !== undefined),
                };
            }));
            if (nick === callNick() && presence.muc.jid === c.jid) onOwnEcho(roomJid, presence);
        };

        const onGroupchat = (msg: ReceivedMessage) => {
            const roomJid = JID.toBare(msg.from);
            const message = toRoomMessage(msg);
            if (!message || !state.rooms[roomJid]) return;
            appendMessage(roomJid, message, 'end');
        };

        const onIncoming = (session: MediaSession) => {
            if (!call()) return;
            void session.accept().catch((error: unknown) => console.warn('Could not accept stream', error));
        };
        const onTrack = (session: MediaSession, _track: MediaStreamTrack, stream: MediaStream) => media.onRemoteTrack(session, stream);
        const onTerminated = (session: MediaSession) => media.onRemoteEnded(session);

        c.on('muc:available', onPresence);
        c.on('muc:unavailable', onPresence);
        c.on('groupchat', onGroupchat);
        c.jingle.on('incoming', onIncoming);
        c.jingle.on('peerTrackAdded', onTrack);
        c.jingle.on('terminated', onTerminated);
        onCleanup(() => {
            c.off('muc:available', onPresence);
            c.off('muc:unavailable', onPresence);
            c.off('groupchat', onGroupchat);
            c.jingle.off('incoming', onIncoming);
            c.jingle.off('peerTrackAdded', onTrack);
            c.jingle.off('terminated', onTerminated);
        });

        void (async () => {
            const pubsubJid = await findPubsubService(c, JID.getDomain(ownJid));
            if (!pubsubJid) {
                console.warn('No PubSub service found on', JID.getDomain(ownJid));
                return;
            }
            const guilds = await fetchManifests(c, pubsubJid);
            setState('guilds', guilds);
            const component = `vc.${JID.getDomain(ownJid)}`;
            const listed = await c.getDiscoItems(component, 'http://jabber.org/protocol/commands').catch(() => ({ items: [] }));
            setCommands((listed.items ?? []).flatMap((item) => (item.node ? [item.node] : [])));
            await joinRooms(c, guilds);
        })().catch((error: unknown) => {
            console.warn('Guild discovery failed', error);
        });
    });

    const value: GuildContextType = {
        guilds: () => state.guilds,
        guild: (slug) => state.guilds.find((guild) => guild.slug === slug),
        channel: (slug, name) => {
            const guild = state.guilds.find((entry) => entry.slug === slug);
            return guild ? guildChannels(guild).find((channel) => channel.name === name) : undefined;
        },
        room: (roomJid) => state.rooms[roomJid],
        ownNick,
        ownJid,
        loadLatestHistory,
        loadOlderHistory,
        sendRoomMessage,
        commands,
        isInstanceAdmin,
        ownAffiliation,
        call,
        media,
        joinCall,
        leaveCall,
        setVoiceState,
    };

    return <GuildContext.Provider value={value}>{props.children}</GuildContext.Provider>;
};

export const useGuilds = () => {
    const context = useContext(GuildContext);
    if (!context) throw new Error('useGuilds must be used within <GuildProvider>');
    return context;
};
