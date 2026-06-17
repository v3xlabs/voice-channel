import { Accessor, createContext, createEffect, createMemo, createSignal, onCleanup, useContext, type ParentComponent } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { Agent, createClient } from 'stanza';
import type { Credentials } from 'stanza/lib/sasl';
import { OmemoManager } from '../encryption/omemo';
import { createTrustStore } from '../encryption/trust';
import { getTabId } from '../encryption/storage';
import type { EncryptionMechanism, TrustLevel, ContactTrustSummary } from '../encryption/types';

export type AuthContextType = {
    isAuthed: Accessor<boolean>;
    isConnecting: Accessor<boolean>;
    isBootstrapping: Accessor<boolean>;
    isSyncing: Accessor<boolean>;
    jid: Accessor<string | undefined>;
    resource: Accessor<string>;
    profile: Accessor<ContactProfile | undefined>;
    contacts: Accessor<ContactProfile[]>;
    presence: Accessor<PresenceState>;
    login: (jid: string, password: string) => void;
    logout: () => void;
    setResource: (resource: string) => void;
    privateChats: Accessor<PrivateChatSummary[]>;
    messagesFor: (conversationJid: string) => XmppMessage[];
    loadLatestMessages: (conversationJid: string, max?: number) => Promise<void>;
    loadOlderMessages: (conversationJid: string, max?: number) => Promise<void>;
    hasOlderMessages: (conversationJid: string) => boolean;
    markConversationRead: (conversationJid: string) => void;
    sendChat: (to: string, body: string) => Promise<string | undefined>;
    setPresence: (presence: PresenceState) => void;
    pendingSubscriptions: Accessor<ContactProfile[]>;
    acceptSubscription: (jid: string) => void;
    denySubscription: (jid: string) => void;
    addContact: (jid: string) => void;
    omemo: {
        manager: Accessor<OmemoManager | undefined>;
        canUse: Accessor<boolean>;
        setEnabled: (enabled: boolean) => void;
        isEnabled: Accessor<boolean>;
        deviceIds: Accessor<number[]>;
        refreshDeviceList: () => Promise<void>;
        publishDeviceList: (deviceIds: number[]) => Promise<number[]>;
        republish: () => Promise<void>;
        regenerateIdentity: () => Promise<void>;
    };
    encryption: {
        getChatEncryption: (jid: string) => { mechanism: EncryptionMechanism; enabled: boolean };
        setChatEncryption: (jid: string, mode: { mechanism: EncryptionMechanism; enabled: boolean }) => void;
        setChatEncryptionEnabled: (jid: string, enabled: boolean) => void;
        setChatEncryptionMechanism: (jid: string, mechanism: EncryptionMechanism) => void;
        getDeviceTrust: (jid: string, deviceId: number) => TrustLevel;
        setDeviceTrust: (jid: string, deviceId: number, level: TrustLevel) => void;
        cycleDeviceTrust: (jid: string, deviceId: number) => void;
        isContactTrusted: (jid: string) => boolean;
        contactTrust: Accessor<ContactTrustSummary[]>;
        getKnownContactDevices: (jid: string) => number[];
        refreshContactDevices: (jid: string) => Promise<number[]>;
        fetchContactDevices: (jid: string) => Promise<number[]>;
        recordKey: (jid: string, deviceId: number, publicKey: ArrayBuffer) => void;
    };
};

const AuthContext = createContext<AuthContextType>();

const VC_CRED_KEY = '@vc/xmpp-credentials';
const VC_SETTINGS_KEY = '@vc/xmpp-settings';
const VC_READ_STATE_PREFIX = '@vc/xmpp-read-state';
const VC_MESSAGES_PREFIX = '@vc/xmpp-messages';
const DEFAULT_RESOURCE = 'voice-channel-web';
const DEFAULT_PRESENCE: PresenceState = { show: 'online', status: '' };

type PersistedCred = {
    jid: string;
    credentials: Credentials;
};

type XmppSettings = {
    resource: string;
    presence: PresenceState;
};

export type XmppMessage = {
    id: string;
    conversationJid: string;
    from: string;
    to?: string;
    body: string;
    timestamp: number;
    direction: 'in' | 'out';
    archived: boolean;
    encryption: 'none' | 'eme' | 'omemo';
};

export type PrivateChatSummary = {
    jid: string;
    name?: string;
    avatarUrl?: string;
    presence: PresenceKind;
    statusText?: string;
    lastMessage?: XmppMessage;
    unreadCount: number;
    lastReadAt?: number;
    hasOlder: boolean;
};

type PresenceKind = 'offline' | 'online' | 'chat' | 'away' | 'xa' | 'dnd';

type PresenceState = {
    show: Exclude<PresenceKind, 'offline' | 'online'> | 'online';
    status: string;
};

type ContactProfile = {
    jid: string;
    name?: string;
    avatarUrl?: string;
    avatarHash?: string;
    subscription?: string;
    pendingSubscription?: boolean;
    presence: PresenceKind;
    statusText?: string;
};

type PresenceResourceState = {
    presence: PresenceKind;
    statusText?: string;
    updatedAt: number;
};

type ConversationMeta = {
    unreadCount: number;
    lastReadAt?: number;
    mamBefore?: string;
    hasOlder: boolean;
};

type HistorySearchResult = {
    complete?: boolean;
    paging?: {
        first?: string;
    };
    results?: unknown[];
};

const NS_OMEMO_DEVICELIST = 'eu.siacs.conversations.axolotl.devicelist';
const NS_OMEMO_AXOLOTL = 'eu.siacs.conversations.axolotl';
const NS_OMEMO_BUNDLES = `${NS_OMEMO_AXOLOTL}.bundles`;
const pepNotify = (node: string) => `${node}+notify`;

// Module-level client reference that survives HMR cycles
// Ensures old WebSocket is closed before new one opens
let _activeClient: Agent | undefined;

const parseJSON = <T,>(value: string | null, fallback: T): T => {
    if (!value) return fallback;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
};

const sanitizeCredentials = (credentials?: Credentials): Credentials => {
    if (!credentials) return {};
    const allowedKeys = new Set([
        'password',
        'username',
        'host',
        'realm',
        'serviceName',
        'serviceType',
        'oauthToken',
        'clientNonce',
    ]);
    const next: Record<string, string | number | boolean> = {};
    const source = credentials as Record<string, unknown>;
    for (const key of Object.keys(source)) {
        if (!allowedKeys.has(key)) continue;
        const value = source[key];
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            next[key] = value;
        }
    }
    return next as Credentials;
};

const sanitizePersistedCred = (value: PersistedCred | undefined): PersistedCred | undefined => {
    if (!value?.jid) return undefined;
    return {
        jid: value.jid,
        credentials: sanitizeCredentials(value.credentials),
    };
};

const readStateKeyFor = (jid?: string) => {
    if (!jid) return `${VC_READ_STATE_PREFIX}:anon`;
    return `${VC_READ_STATE_PREFIX}:${toBareJid(jid)}`;
};

const messagesKeyFor = (jid?: string) => {
    if (!jid) return `${VC_MESSAGES_PREFIX}:anon`;
    return `${VC_MESSAGES_PREFIX}:${toBareJid(jid)}`;
};

const toBareJid = (value?: string) => {
    if (!value) return '';
    const slashIndex = value.indexOf('/');
    if (slashIndex < 0) return value;
    return value.slice(0, slashIndex);
};

const toResource = (value?: string) => {
    if (!value) return '';
    const slashIndex = value.indexOf('/');
    if (slashIndex < 0) return '';
    return value.slice(slashIndex + 1);
};

const getMessageBody = (msg: any) => {
    if (typeof msg?.body === 'string' && msg.body.trim().length > 0) return msg.body;
    const firstAlternate = msg?.alternateLanguageBodies?.[0];
    if (firstAlternate?.value) return String(firstAlternate.value);
    return '';
};

const normalizePresence = (show?: string, type?: string): PresenceKind => {
    if (type === 'unavailable') return 'offline';
    if (show === 'chat' || show === 'away' || show === 'xa' || show === 'dnd') return show;
    return 'online';
};

const toDataUrl = (bytes: unknown, mediaType = 'image/jpeg') => {
    if (!(bytes instanceof Uint8Array)) return undefined;
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `data:${mediaType};base64,${btoa(binary)}`;
};

export const AuthProvider: ParentComponent = (props) => {
    const initialSettings = parseJSON<Partial<XmppSettings>>(localStorage.getItem(VC_SETTINGS_KEY), {});
    const initialStatus = initialSettings.presence?.status === 'Voice Channel online'
        ? ''
        : (initialSettings.presence?.status || DEFAULT_PRESENCE.status);
    const [creds, setCredentials] = createSignal<PersistedCred | undefined>(
        sanitizePersistedCred(parseJSON<PersistedCred | undefined>(localStorage.getItem(VC_CRED_KEY), undefined))
    );
    const [settings, setSettings] = createSignal<XmppSettings>({
        resource: initialSettings.resource || DEFAULT_RESOURCE,
        presence: {
            show: initialSettings.presence?.show || DEFAULT_PRESENCE.show,
            status: initialStatus,
        },
    });
    const [persistedReadState, setPersistedReadState] = createSignal<Record<string, number>>(
        parseJSON<Record<string, number>>(localStorage.getItem(readStateKeyFor(creds()?.jid)), {})
    );

    createEffect(() => {
        const c = creds();
        if (c) localStorage.setItem(VC_CRED_KEY, JSON.stringify(c));
        else localStorage.removeItem(VC_CRED_KEY);
    });

    createEffect(() => {
        localStorage.setItem(VC_SETTINGS_KEY, JSON.stringify(settings()));
    });

    createEffect(() => {
        const key = readStateKeyFor(creds()?.jid);
        localStorage.setItem(key, JSON.stringify(persistedReadState()));
    });

    const [isAuthed, setIsAuthed] = createSignal(false);
    const [isConnecting, setIsConnecting] = createSignal(false);
    const [isBootstrapping, setIsBootstrapping] = createSignal(Boolean(creds()));
    const [hasSession, setHasSession] = createSignal(false);
    const [client, setClient] = createSignal<Agent | undefined>(undefined);
    const [contactsByJid, setContactsByJid] = createStore<Record<string, ContactProfile>>({});
    const [presenceByContact, setPresenceByContact] = createStore<Record<string, Record<string, PresenceResourceState>>>({});
    const [messagesByConversation, setMessagesByConversation] = createStore<Record<string, XmppMessage[]>>({});
    const [conversationMeta, setConversationMeta] = createStore<Record<string, ConversationMeta>>({});
    const [omemoAvailable, setOmemoAvailable] = createSignal(false);
    const [omemoEnabled, setOmemoEnabled] = createSignal(false);
    const [omemoDeviceIds, setOmemoDeviceIds] = createSignal<number[]>([]);
    const [isSyncing, setIsSyncing] = createSignal(false);
    const [omemoManager, setOmemoManager] = createSignal<OmemoManager | undefined>(undefined);
    const [trustStore, setTrustStore] = createSignal<ReturnType<typeof createTrustStore> | undefined>(undefined);
    const [contactDeviceVersion, setContactDeviceVersion] = createSignal(0);
    const seenMessageIds = new Set<string>();

    // Ensure the active XMPP client is disconnected when this component unmounts
    // (e.g. during HMR reload). Uses the module-level ref so the old client is
    // always disconnected before a new one connects.
    onCleanup(() => {
        if (_activeClient) {
            _activeClient.disconnect();
            _activeClient = undefined;
        }
    });

    const collectIncomingIds = (incoming: any) => {
        const ids: string[] = [];
        if (incoming?.archive?.id) ids.push(String(incoming.archive.id));
        if (Array.isArray(incoming?.stanzaIds)) {
            for (const item of incoming.stanzaIds) {
                if (item?.id) ids.push(String(item.id));
            }
        }
        if (incoming?.originId) ids.push(String(incoming.originId));
        if (incoming?.id) ids.push(String(incoming.id));
        return Array.from(new Set(ids.filter(Boolean)));
    };

    const rebuildSeenMessageIds = (source: Record<string, XmppMessage[]>) => {
        seenMessageIds.clear();
        for (const conversationJid of Object.keys(source)) {
            for (const item of source[conversationJid] || []) {
                seenMessageIds.add(`${conversationJid}:${item.id}`);
            }
        }
    };

    const ensureContact = (jid: string) => {
        if (!jid) return;
        if (!contactsByJid[jid]) {
            setContactsByJid(jid, {
                jid,
                presence: 'offline',
            });
        }
    };

    const patchContact = (jid: string, patch: Partial<ContactProfile>) => {
        ensureContact(jid);
        setContactsByJid(jid, (previous) => ({
            ...previous,
            ...patch,
        }));
    };

    const aggregatePresence = (states: Record<string, PresenceResourceState> | undefined): { presence: PresenceKind; statusText?: string } => {
        if (!states) return { presence: 'offline', statusText: '' };
        const entries = Object.values(states);
        if (entries.length === 0) return { presence: 'offline', statusText: '' };

        const hasOnline = entries.some((item) => item.presence === 'online' || item.presence === 'chat');
        const hasAway = entries.some((item) => item.presence === 'away');
        const hasXa = entries.some((item) => item.presence === 'xa');
        const hasDnd = entries.some((item) => item.presence === 'dnd');

        const sortedByRecency = [...entries].sort((a, b) => b.updatedAt - a.updatedAt);
        const statusText = sortedByRecency.find((item) => item.statusText)?.statusText || '';

        if (hasOnline) return { presence: 'online', statusText };
        if (hasDnd) return { presence: 'dnd', statusText };
        if (hasAway) return { presence: 'away', statusText };
        if (hasXa) return { presence: 'xa', statusText };
        return { presence: 'offline', statusText };
    };

    const hydrateMessagesFromStorage = (accountJid?: string) => {
        const stored = parseJSON<Record<string, XmppMessage[]>>(
            localStorage.getItem(messagesKeyFor(accountJid)),
            {}
        );

        const sanitized: Record<string, XmppMessage[]> = {};
        for (const conversationJid of Object.keys(stored)) {
            const messages = (stored[conversationJid] || [])
                .filter((message) => typeof message?.id === 'string' && typeof message?.body === 'string')
                .sort((a, b) => a.timestamp - b.timestamp)
                .slice(-100);
            if (messages.length > 0) {
                sanitized[conversationJid] = messages;
            }
        }

        setMessagesByConversation(reconcile(sanitized));
        rebuildSeenMessageIds(sanitized);
        for (const jid of Object.keys(sanitized)) {
            ensureContact(jid);
        }
    };

    const persistMessagesToStorage = (accountJid?: string) => {
        if (!accountJid) return;
        const snapshot: Record<string, XmppMessage[]> = {};
        for (const conversationJid of Object.keys(messagesByConversation)) {
            const messages = (messagesByConversation[conversationJid] || []).slice(-100);
            if (messages.length > 0) snapshot[conversationJid] = messages;
        }
        localStorage.setItem(messagesKeyFor(accountJid), JSON.stringify(snapshot));
    };

    const ensureMeta = (conversationJid: string) => {
        if (!conversationMeta[conversationJid]) {
            setConversationMeta(conversationJid, {
                unreadCount: 0,
                lastReadAt: persistedReadState()[conversationJid],
                hasOlder: false,
            });
        }
    };

    const recordMessage = (incoming: any, archived: boolean, source: 'incoming' | 'outgoing' = 'incoming', forcedBody?: string) => {
        const c = creds();
        if (!c) return;

        const body = forcedBody || getMessageBody(incoming);
        if (!body) return;

        const self = toBareJid(c.jid);
        const from = toBareJid(incoming.from) || (source === 'outgoing' ? self : '');
        const to = toBareJid(incoming.to) || (source === 'incoming' ? self : '');
        const conversationJid = source === 'outgoing' ? to : (from === self ? to : from);
        if (!conversationJid) return;
        ensureContact(conversationJid);

        const timestamp = incoming?.delay?.stamp
            ? new Date(incoming.delay.stamp).getTime()
            : Date.now();

        const incomingIds = collectIncomingIds(incoming);
        const stableId = incomingIds[0] || `${conversationJid}-${timestamp}-${body.length}-${source}`;
        for (const knownId of incomingIds) {
            if (seenMessageIds.has(`${conversationJid}:${knownId}`)) return;
        }

        const encryption = incoming?.omemo
            ? 'omemo'
            : incoming?.encryptionMethod
                ? 'eme'
                : 'none';

        const direction = source === 'outgoing' || from === self ? 'out' : 'in';

        const normalized: XmppMessage = {
            id: stableId,
            conversationJid,
            from,
            to,
            body,
            timestamp,
            direction,
            archived,
            encryption,
        };

        let inserted = false;
        setMessagesByConversation(conversationJid, (current = []) => {
            const mergeCandidateIndex = current.findIndex((existing) => {
                if (incomingIds.includes(existing.id)) return true;

                const sameDirection = existing.direction === direction;
                const sameBody = existing.body === body;
                const closeInTime = Math.abs(existing.timestamp - timestamp) < 90_000;
                const optimisticMatch = sameDirection && sameBody && closeInTime;
                const archiveUpgrade = archived && optimisticMatch;
                return archiveUpgrade;
            });

            if (mergeCandidateIndex >= 0) {
                const existing = current[mergeCandidateIndex];
                const updated: XmppMessage = {
                    ...existing,
                    archived: existing.archived || archived,
                    encryption: existing.encryption === 'none' ? encryption : existing.encryption,
                    to: existing.to || to,
                    from: existing.from || from,
                };
                const next = [...current];
                next[mergeCandidateIndex] = updated;
                return next;
            }

            inserted = true;
            const next = [...current, normalized];
            next.sort((a, b) => a.timestamp - b.timestamp);
            return next;
        });

        seenMessageIds.add(`${conversationJid}:${stableId}`);
        for (const incomingId of incomingIds) {
            seenMessageIds.add(`${conversationJid}:${incomingId}`);
        }

        ensureMeta(conversationJid);
        if (inserted && direction === 'in' && !archived) {
            const lastReadAt = conversationMeta[conversationJid]?.lastReadAt || 0;
            if (normalized.timestamp > lastReadAt) {
                setConversationMeta(conversationJid, 'unreadCount', (count = 0) => count + 1);
            }
        }
    };

    const processIncomingMessage = async (
        incoming: any,
        archived: boolean,
        source: 'incoming' | 'outgoing' = 'incoming'
    ) => {
        const manager = omemoManager();
        const omemoPayload = incoming?.omemo;
        if (!omemoPayload || !manager) {
            recordMessage(incoming, archived, source);
            return;
        }

        const selfDeviceId = manager.getDeviceId();
        const keyEntry = omemoPayload.header?.keys?.find(
            (k: any) => Number(k.rid) === selfDeviceId
        ) as any;

        // If we have no identity yet or this message isn't for us, record placeholder
        if (!selfDeviceId || !keyEntry) {
            recordMessage(
                incoming,
                archived,
                source,
                '[OMEMO encrypted message — not encrypted for this device]'
            );
            return;
        }

        const fromJid = source === 'outgoing'
            ? toBareJid(creds()?.jid)
            : toBareJid(incoming.from);
        const fromBare = fromJid;
        const senderDeviceId = Number(omemoPayload.header.sid);

        try {
            // Record sender identity key for trust display (non-blocking, best-effort)
            manager.ensureContactKeyStore(fromBare).then((keystore) => {
                const bundle = keystore.bundles.find((b) => b.deviceId === senderDeviceId);
                if (bundle) trustStore()?.recordKey(fromBare, senderDeviceId, bundle.identityKey);
            });

            const decrypted = await manager.decryptMessage(
                fromJid,
                senderDeviceId,
                omemoPayload.header.iv,
                keyEntry.value,
                keyEntry.preKey === true,
                omemoPayload.payload
            );

            if (decrypted) {
                recordMessage(incoming, archived, source, decrypted);
            } else {
                recordMessage(incoming, archived, source, '[OMEMO — decryption failed]');
            }
        } catch (error) {
            console.error('Error processing OMEMO message', error);
            recordMessage(incoming, archived, source, '[OMEMO — decryption error]');
        }
    };

    const extractForwardedMessage = (archiveResult: any) => {
        if (!archiveResult) return undefined;
        if (archiveResult.item?.message) return archiveResult.item.message;
        if (archiveResult.forwarded?.message) return archiveResult.forwarded.message;
        return archiveResult.message;
    };

    const applyMAMResults = async (results: any[] | undefined) => {
        if (!results?.length) return;
        for (const item of results) {
            const forwarded = extractForwardedMessage(item);
            if (!forwarded) continue;
            if (forwarded.type && forwarded.type !== 'chat') continue;
            await processIncomingMessage(forwarded, true);
        }
    };

    const loadRecentConversations = async (xmpp: Agent) => {
        try {
            const result = await xmpp.searchHistory({ paging: { max: 120 } } as any);
            applyMAMResults((result as any)?.results);
        } catch (error) {
            console.error('Failed to load recent MAM conversations', error);
        }
    };

    const applyMAMPaging = (conversationJid: string, searchResult: any, mode: 'latest' | 'older') => {
        ensureMeta(conversationJid);

        const paging = searchResult?.paging;
        const before = paging?.first;
        if (before) {
            setConversationMeta(conversationJid, 'mamBefore', before);
        }

        const complete = searchResult?.complete === true;
        const hasOlder = mode === 'older'
            ? !complete && Boolean(before)
            : Boolean(before);
        setConversationMeta(conversationJid, 'hasOlder', hasOlder);
    };

    const getEffectiveResource = () => {
        const base = settings().resource || DEFAULT_RESOURCE;
        return `${base}.${getTabId().slice(0, 8)}`;
    };

    const refreshOmemoDeviceList = async () => {
        const xmpp = client();
        const accountJid = creds()?.jid;
        if (!xmpp || !accountJid) return;

        try {
            const response = await xmpp.getItems(
                toBareJid(accountJid),
                NS_OMEMO_DEVICELIST,
                { max: 1 }
            );
            const items = response?.items;
            const devices = (items?.[0]?.content as any)?.devices || [];
            setOmemoDeviceIds(devices);
        } catch {
            setOmemoDeviceIds([]);
        }
    };

    const publishOmemoDeviceList = async (deviceIds: number[]) => {
        const manager = omemoManager();
        if (!manager) return [];

        try {
            const devices = await manager.ensurePublished(deviceIds);
            setOmemoDeviceIds(devices);
            return devices;
        } catch (error) {
            console.error('Failed to publish OMEMO device list', error);
            throw error;
        }
    };

    const republishOmemo = async () => {
        const manager = omemoManager();
        const c = client();
        if (!manager) return;

        try {
            await manager.ensurePublished();
            if (c) {
                c.updateCaps();
                const configuredPresence = settings().presence;
                c.sendPresence({
                    show: configuredPresence.show === 'online' ? undefined : configuredPresence.show,
                    status: configuredPresence.status || undefined,
                });
            }
        } catch (error) {
            console.error('Failed to republish OMEMO keys', error);
        } finally {
            await refreshOmemoDeviceList();
        }
    };

    const loadOwnProfile = async (xmpp: Agent, accountJid: string) => {
        const bare = toBareJid(accountJid);
        if (!bare) return;

        try {
            const vcard = await xmpp.getVCard(bare);
            const photo = (vcard?.records || []).find((record: any) => record?.type === 'photo') as any;
            const avatarUrl = photo?.data instanceof Uint8Array
                ? toDataUrl(photo.data, photo.mediaType || 'image/jpeg')
                : undefined;
            patchContact(bare, {
                jid: bare,
                name: vcard?.fullName,
                avatarUrl,
            });
        } catch {
            // ignore vcard fetch errors
        }
    };

    let lifecycleCleanup: (() => void) | undefined;

    const setupClient = (reason: 'login' | 'restore' | 'resource-change') => {
        const { jid, credentials } = creds() ?? {};
        if (!jid || !credentials) return undefined;

        const bareJid = toBareJid(jid);
        let manager = omemoManager();
        if (!manager) {
            manager = new OmemoManager(bareJid);
            setOmemoManager(manager);
        }

        if (!trustStore()) {
            setTrustStore(createTrustStore(bareJid));
        }

        manager.setEncryptFilter((contactJid, deviceId) => {
            return trustStore()?.shouldEncryptToDevice(contactJid, deviceId, bareJid) ?? true;
        });

        // Disconnect any previous active client BEFORE creating a new one
        // Uses module-level ref to survive HMR cycles
        if (_activeClient) {
            _activeClient.disconnect();
            _activeClient = undefined;
        }

        const c = createClient({
            jid,
            credentials,
            autoReconnect: true,
            useStreamManagement: true,
            allowResumption: true,
            resource: getEffectiveResource(),
        });

        _activeClient = c;
        manager.bindClient(c);

        if (lifecycleCleanup) lifecycleCleanup();
        lifecycleCleanup = undefined;

        setClient(c);
        setIsConnecting(true);
        setIsBootstrapping(true);
        setHasSession(false);

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (hasSession()) {
                event.preventDefault();
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && hasSession() && c) {
                const configuredPresence = settings().presence;
                c.sendPresence({
                    show: configuredPresence.show === 'online' ? undefined : configuredPresence.show,
                    status: configuredPresence.status || undefined,
                });
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        lifecycleCleanup = () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };

        c.on('connected', () => {
            setIsConnecting(false);
        });

        c.on('auth:success', () => {
            setIsAuthed(true);
            setIsConnecting(false);
            setIsBootstrapping(false);
        });

        c.on('auth:failed', () => {
            setIsAuthed(false);
            setIsConnecting(false);
            setIsBootstrapping(false);
        });

        c.on('session:started', async () => {
            setHasSession(true);

            // 1. Enable carbons for message synchronization across devices
            try {
                await c.enableCarbons();
            } catch (e) {
                console.error('Failed to enable carbons', e);
            }

            // 2. Load roster (contact list)
            try {
                const roster = await c.getRoster();
                for (const item of roster?.items || []) {
                    const contactJid = toBareJid((item as any).jid);
                    if (!contactJid) continue;
                    const subscription = (item as any).subscription as string | undefined;
                    patchContact(contactJid, {
                        jid: contactJid,
                        name: (item as any).name,
                        subscription,
                        pendingSubscription: subscription === 'from',
                    });

                    if (subscription && subscription !== 'none') {
                        c.sendPresence({
                            to: contactJid,
                            type: 'probe',
                        });
                    }
                }
            } catch (e) {
                console.error('Failed to load roster', e);
            }

            // 3. Initialize OMEMO identity BEFORE updating caps
            const manager = omemoManager();
            if (manager) {
                try {
                    await manager.initialize();
                } catch (e) {
                    console.error('Failed to initialize OMEMO identity', e);
                }
            }

            // 3.5 Register OMEMO and EME features in Entity Capabilities before broadcasting presence
            try {
                c.disco.addFeature(NS_OMEMO_AXOLOTL);
                c.disco.addFeature(NS_OMEMO_DEVICELIST);
                c.disco.addFeature(pepNotify(NS_OMEMO_DEVICELIST));
                c.disco.addFeature(pepNotify(NS_OMEMO_BUNDLES));
                c.disco.addFeature('urn:xmpp:eme:0');
            } catch (e) {
                // Feature registration is best-effort
            }

            // 4. Update client capabilities (now includes OMEMO features if available)
            c.updateCaps();

            // 5. Send initial presence (broadcasts capabilities hash)
            const configuredPresence = settings().presence;
            c.sendPresence({
                show: configuredPresence.show === 'online' ? undefined : configuredPresence.show,
                status: configuredPresence.status || undefined,
            });

            // 6. Publish OMEMO keys and subscribe to PEP push updates
            if (manager) {
                setOmemoAvailable(true);

                try {
                    const devices = await manager.ensurePublished();
                    setOmemoDeviceIds(devices);
                    c.updateCaps();
                    c.sendPresence({
                        show: configuredPresence.show === 'online' ? undefined : configuredPresence.show,
                        status: configuredPresence.status || undefined,
                    });
                } catch (e) {
                    console.error('OMEMO publish failed (keys still available locally)', e);
                    await refreshOmemoDeviceList();
                }

                // Subscribe to our own OMEMO devicelist PEP for push updates (best-effort)
                try {
                    await c.subscribeToNode(toBareJid(jid), {
                        node: NS_OMEMO_DEVICELIST,
                    });
                } catch (e) {
                    // Subscription may fail; PEP push still works from presence subscription
                }
            }

            // 7. Load MAM history
            setIsSyncing(true);
            try {
                await loadRecentConversations(c);
            } finally {
                setIsSyncing(false);
            }

            // 8. Load own profile
            await loadOwnProfile(c, jid);

            // 9. Update our own contact in local store
            patchContact(toBareJid(jid), {
                jid: toBareJid(jid),
                presence: normalizePresence(configuredPresence.show),
                statusText: configuredPresence.status,
            });
        });

        c.on('session:end', () => {
            setHasSession(false);
            setIsAuthed(false);
            setOmemoAvailable(false);
            setOmemoEnabled(false);
            setOmemoDeviceIds([]);
        });

        c.on('credentials:update', (updatedCredentials) => {
            const merged = {
                ...(creds()?.credentials || {}),
                ...updatedCredentials,
            } as Credentials;
            setCredentials({
                jid,
                credentials: sanitizeCredentials(merged),
            });
        });

        c.on('roster:update', (iq: any) => {
            const items = iq?.roster?.items || [];
            for (const item of items) {
                const contactJid = toBareJid((item as any).jid);
                if (!contactJid) continue;
                const subscription = (item as any).subscription as string | undefined;
                patchContact(contactJid, {
                    jid: contactJid,
                    name: (item as any).name,
                    subscription,
                    pendingSubscription: subscription === 'from',
                });
            }
        });

        c.on('subscribe', (presence: any) => {
            const fromBare = toBareJid(presence?.from);
            if (!fromBare) return;
            patchContact(fromBare, {
                jid: fromBare,
                pendingSubscription: true,
            });
        });

        c.on('presence', (presence: any) => {
            const fromFull = presence?.from as string | undefined;
            const fromBare = toBareJid(fromFull);
            if (!fromBare) return;

            if (presence?.type === 'subscribe') {
                patchContact(fromBare, {
                    jid: fromBare,
                    pendingSubscription: true,
                });
                return;
            }

            const resource = toResource(fromFull);

            if (!resource) {
                patchContact(fromBare, {
                    presence: normalizePresence(presence?.show, presence?.type),
                    statusText: presence?.status || '',
                });
                return;
            }

            if (presence?.type === 'unavailable') {
                const currentResources = { ...(presenceByContact[fromBare] || {}) };
                delete currentResources[resource];
                setPresenceByContact(fromBare, currentResources);
            } else {
                setPresenceByContact(fromBare, resource, {
                    presence: normalizePresence(presence?.show, presence?.type),
                    statusText: presence?.status || '',
                    updatedAt: Date.now(),
                });
            }

            const aggregate = aggregatePresence(presenceByContact[fromBare]);
            patchContact(fromBare, {
                presence: aggregate.presence,
                statusText: aggregate.statusText,
            });
        });

        c.on('avatar', async (event: any) => {
            const avatarJid = toBareJid(event?.jid);
            const avatarId = event?.avatars?.[0]?.id;
            if (!avatarJid || !avatarId) return;

            patchContact(avatarJid, { avatarHash: avatarId });

            try {
                const avatar = await c.getAvatar(avatarJid, avatarId);
                const content = (avatar as any)?.item?.content;
                const url = toDataUrl(content?.data, content?.mediaType || 'image/jpeg');
                if (url) {
                    patchContact(avatarJid, { avatarUrl: url });
                }
            } catch {
                // ignore avatar fetch errors
            }
        });

        c.on('chat', (msg: any) => {
            void processIncomingMessage(msg, false);
        });

        c.on('mam:item', (msg: any) => {
            void processIncomingMessage(msg, true);
        });

        c.on('carbon:received', (payload: any) => {
            const forwarded = payload?.carbonReceived?.forwarded?.message || payload?.forwarded?.message;
            if (forwarded) void processIncomingMessage(forwarded, false);
        });

        c.on('carbon:sent', (payload: any) => {
            const forwarded = payload?.carbonSent?.forwarded?.message || payload?.forwarded?.message;
            if (!forwarded) return;
            if (forwarded.omemo) {
                void processIncomingMessage(forwarded, false, 'outgoing');
                return;
            }
            recordMessage(forwarded, false, 'outgoing');
        });

        c.on('message:sent', (msg: any) => {
            if (msg?.omemo) return; // already recorded manually with plaintext body
            recordMessage(msg, false, 'outgoing');
        });

        // Listen for PEP updates (OMEMO device list changes, etc.)
        c.on('pubsub:published', (event: any) => {
            const node = event?.pubsub?.node || event?.pubsub?.items?.node;
            if (node !== NS_OMEMO_DEVICELIST || !event?.pubsub?.items?.published) return;

            const fromJid = toBareJid(event.jid || event.from);
            const selfJid = toBareJid(creds()?.jid);
            if (fromJid === selfJid) {
                void refreshOmemoDeviceList();
                return;
            }

            const manager = omemoManager();
            if (manager && fromJid) {
                void manager.ensureContactKeyStore(fromJid, true).then((keystore) => {
                    for (const bundle of keystore.bundles) {
                        trustStore()?.recordKey(fromJid, bundle.deviceId, bundle.identityKey);
                    }
                });
            }
        });

        c.connect();

        return reason;
    };

    const login = (jid: string, password: string) => {
        const trimmedJid = jid.trim();
        if (!trimmedJid || !password) return;
        setCredentials({
            jid: trimmedJid,
            credentials: sanitizeCredentials({
                password,
            }),
        });
    };

    const clearMessages = () => {
        for (const key of Object.keys(messagesByConversation)) {
            setMessagesByConversation(key, []);
        }
        for (const key of Object.keys(conversationMeta)) {
            setConversationMeta(key, {
                unreadCount: 0,
                hasOlder: false,
            });
        }
        seenMessageIds.clear();
    };

    const logout = () => {
        const accountJid = creds()?.jid;
        if (lifecycleCleanup) lifecycleCleanup();
        if (_activeClient) {
            _activeClient.disconnect();
            _activeClient = undefined;
        }
        setClient(undefined);
        setCredentials(undefined);
        setContactsByJid(reconcile({}));
        setPresenceByContact(reconcile({}));
        clearMessages();
        setHasSession(false);
        setIsAuthed(false);
        setIsConnecting(false);
        setIsBootstrapping(false);
        setOmemoDeviceIds([]);
        setOmemoManager(undefined);
        setTrustStore(undefined);
        setPersistedReadState({});
        localStorage.removeItem(messagesKeyFor(accountJid));
    };

    const messagesFor = (conversationJid: string) => {
        return messagesByConversation[conversationJid] || [];
    };

    const markConversationRead = (conversationJid: string) => {
        ensureMeta(conversationJid);
        const now = Date.now();
        setConversationMeta(conversationJid, {
            ...conversationMeta[conversationJid],
            unreadCount: 0,
            lastReadAt: now,
        });
        setPersistedReadState((previous) => ({
            ...previous,
            [conversationJid]: now,
        }));
    };

    const loadLatestMessages = async (conversationJid: string, max = 30) => {
        const c = client();
        if (!c || !hasSession() || !conversationJid) return;

        setIsSyncing(true);
        try {
            const result = await c.searchHistory({
                with: conversationJid,
                paging: { max },
            } as any) as HistorySearchResult;

            await applyMAMResults(result.results);
            applyMAMPaging(conversationJid, result, 'latest');
        } finally {
            setIsSyncing(false);
        }
    };

    const loadOlderMessages = async (conversationJid: string, max = 30) => {
        const c = client();
        const before = conversationMeta[conversationJid]?.mamBefore;
        if (!c || !hasSession() || !conversationJid || !before) return;

        setIsSyncing(true);
        try {
            const result = await c.searchHistory({
                with: conversationJid,
                paging: { max, before },
            } as any) as HistorySearchResult;

            await applyMAMResults(result.results);
            applyMAMPaging(conversationJid, result, 'older');
        } finally {
            setIsSyncing(false);
        }
    };

    const sendChat = async (to: string, body: string) => {
        const c = client();
        const trimmedBody = body.trim();
        if (!c || !trimmedBody) return undefined;

        const contactJid = toBareJid(to);
        const selfJid = toBareJid(creds()?.jid);
        const chatEncryption = trustStore()?.getChatEncryption(contactJid);
        const wantsOmemo = chatEncryption?.enabled && chatEncryption?.mechanism === 'omemo' && omemoAvailable();
        const manager = omemoManager();

        if (wantsOmemo && manager) {
            const encrypted = await manager.encryptMessage(contactJid, trimmedBody);
            if (encrypted) {
                const id = c.sendMessage({
                    to,
                    type: 'chat',
                    body: '[OMEMO encrypted message]',
                    omemo: {
                        header: {
                            iv: new Uint8Array(encrypted.iv),
                            sid: encrypted.sid,
                            keys: encrypted.keys.map((k) => ({
                                rid: k.rid,
                                preKey: k.prekey,
                                value: new Uint8Array(k.value),
                            })),
                        },
                        payload: new Uint8Array(encrypted.payload),
                    },
                    encryptionMethod: { id: NS_OMEMO_AXOLOTL, name: 'OMEMO' },
                    processingHints: { store: true },
                } as any);

                recordMessage(
                    { from: selfJid, to: contactJid, id, omemo: true },
                    false,
                    'outgoing',
                    trimmedBody
                );

                return id;
            }
            // encryption failed — for user-facing chats, send an error message instead of falling back
            recordMessage(
                { from: selfJid, to: contactJid, id: '', omemo: true },
                false,
                'outgoing',
                trustStore()?.isContactTrusted(contactJid)
                    ? '[OMEMO — could not encrypt: no device keys available for ' + contactJid + ']'
                    : '[OMEMO — could not encrypt: trust at least one contact device for ' + contactJid + ']'
            );
            return undefined;
        }

        // Plaintext fallback when OMEMO not requested
        const id = c.sendMessage({
            to,
            type: 'chat',
            body: trimmedBody,
        } as any);

        return id;
    };

    const getKnownContactDevices = (jid: string): number[] => {
        contactDeviceVersion();
        const store = trustStore();
        const manager = omemoManager();
        const trustIds = store?.getContactDeviceIds(jid) || [];
        if (!manager) return trustIds;

        if (store) {
            const bare = toBareJid(jid);
            const contactState = store.trustByContact[bare];
            if (contactState) {
                for (const deviceId of Object.keys(contactState.devices)) {
                    void contactState.devices[Number(deviceId)]?.fingerprint;
                }
            }
        }

        return manager.getKnownDevices(jid, trustIds);
    };

    const bumpContactDevices = () => setContactDeviceVersion((value) => value + 1);

    const refreshContactDevices = async (jid: string): Promise<number[]> => {
        const manager = omemoManager();
        if (!manager) return getKnownContactDevices(jid);

        const keystore = await manager.ensureContactKeyStore(jid, true);
        for (const bundle of keystore.bundles) {
            recordKey(jid, bundle.deviceId, bundle.identityKey);
        }
        bumpContactDevices();
        return keystore.devices;
    };

    const fetchContactDevices = async (jid: string): Promise<number[]> => {
        const manager = omemoManager();
        if (!manager) return getKnownContactDevices(jid);

        const keystore = await manager.ensureContactKeyStore(jid, false);
        for (const bundle of keystore.bundles) {
            recordKey(jid, bundle.deviceId, bundle.identityKey);
        }
        bumpContactDevices();
        return keystore.devices.length > 0 ? keystore.devices : getKnownContactDevices(jid);
    };

    const getChatEncryption = (jid: string) => {
        return trustStore()?.getChatEncryption(jid) || { mechanism: 'none' as EncryptionMechanism, enabled: false };
    };

    const setChatEncryption = (jid: string, mode: { mechanism: EncryptionMechanism; enabled: boolean }) => {
        trustStore()?.setChatEncryption(jid, mode);
    };

    const setChatEncryptionEnabled = (jid: string, enabled: boolean) => {
        trustStore()?.setChatEncryptionEnabled(jid, enabled);
    };

    const setChatEncryptionMechanism = (jid: string, mechanism: EncryptionMechanism) => {
        trustStore()?.setChatEncryptionMechanism(jid, mechanism);
    };

    const getDeviceTrust = (jid: string, deviceId: number): TrustLevel => {
        return trustStore()?.getDeviceTrust(jid, deviceId) || 'untrusted';
    };

    const setDeviceTrust = (jid: string, deviceId: number, level: TrustLevel) => {
        trustStore()?.setDeviceTrust(jid, deviceId, level);
    };

    const isContactTrusted = (jid: string): boolean => {
        return trustStore()?.isContactTrusted(jid) || false;
    };

    const recordKey = (jid: string, deviceId: number, publicKey: ArrayBuffer) => {
        const store = trustStore();
        if (!store) return;

        const bare = toBareJid(jid);
        const selfJid = toBareJid(creds()?.jid);
        store.recordKey(bare, deviceId, publicKey);

        if (selfJid && bare === selfJid) {
            store.setDeviceTrust(bare, deviceId, 'trusted');
        }
    };

    const acceptSubscription = (jid: string) => {
        const c = client();
        const bare = toBareJid(jid);
        if (!c || !bare) return;

        c.acceptSubscription(bare);
        c.subscribe(bare);
        patchContact(bare, {
            subscription: 'both',
            pendingSubscription: false,
        });
    };

    const denySubscription = (jid: string) => {
        const c = client();
        const bare = toBareJid(jid);
        if (!c || !bare) return;

        c.denySubscription(bare);
        patchContact(bare, {
            pendingSubscription: false,
        });
    };

    const addContact = (jid: string) => {
        const c = client();
        const bare = toBareJid(jid);
        if (!c || !bare) return;

        c.subscribe(bare);
        patchContact(bare, {
            jid: bare,
            subscription: 'to',
            pendingSubscription: false,
        });
    };

    const cycleDeviceTrust = (jid: string, deviceId: number) => {
        trustStore()?.cycleDeviceTrust(jid, deviceId);
    };

    const pendingSubscriptions = createMemo(() => {
        return Object.values(contactsByJid).filter(
            (contact) => contact.pendingSubscription || contact.subscription === 'from'
        );
    });

    const setResource = (resource: string) => {
        const nextResource = resource.trim();
        if (!nextResource) return;
        setSettings((prev) => ({ ...prev, resource: nextResource }));
    };

    const setPresence = (presence: PresenceState) => {
        const nextShow = presence.show;
        const nextStatus = presence.status.trim();
        const nextPresence: PresenceState = {
            show: nextShow,
            status: nextStatus,
        };

        setSettings((previous) => ({
            ...previous,
            presence: nextPresence,
        }));

        const c = client();
        if (!c || !hasSession()) return;

        c.sendPresence({
            show: nextPresence.show === 'online' ? undefined : nextPresence.show,
            status: nextPresence.status || undefined,
        });

        const selfJid = toBareJid(creds()?.jid);
        if (selfJid) {
            patchContact(selfJid, {
                presence: normalizePresence(nextPresence.show),
                statusText: nextPresence.status,
            });
        }
    };

    createEffect((previousKey) => {
        const c = creds();
        const currentKey = c ? `${c.jid}|${getEffectiveResource()}` : '';

        if (!c) {
            setIsBootstrapping(false);
            return currentKey;
        }

        if (!previousKey) {
            setupClient('restore');
            return currentKey;
        }

        if (previousKey !== currentKey) {
            setupClient('resource-change');
        }

        return currentKey;
    });

    createEffect((previousJid) => {
        const currentJid = creds()?.jid;
        if (currentJid && currentJid !== previousJid) {
            setPersistedReadState(
                parseJSON<Record<string, number>>(localStorage.getItem(readStateKeyFor(currentJid)), {})
            );
            hydrateMessagesFromStorage(currentJid);
        }
        return currentJid;
    });

    createEffect(() => {
        persistMessagesToStorage(creds()?.jid);
    });

    const privateChats = createMemo<PrivateChatSummary[]>(() => {
        const ids = new Set<string>([...Object.keys(contactsByJid), ...Object.keys(messagesByConversation)]);
        const selfJid = toBareJid(creds()?.jid);
        const chats = Array.from(ids)
            .filter((jid) => Boolean(jid) && jid !== selfJid)
            .map((jid) => {
                const items = messagesByConversation[jid] || [];
                const lastMessage = items.length > 0 ? items[items.length - 1] : undefined;
                const contact = contactsByJid[jid];
                return {
                    jid,
                    name: contact?.name,
                    avatarUrl: contact?.avatarUrl,
                    presence: contact?.presence || 'offline',
                    statusText: contact?.statusText,
                    lastMessage,
                    unreadCount: conversationMeta[jid]?.unreadCount || 0,
                    lastReadAt: conversationMeta[jid]?.lastReadAt,
                    hasOlder: conversationMeta[jid]?.hasOlder || false,
                };
            });
        chats.sort((a, b) => {
            const byRecent = (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0);
            if (byRecent !== 0) return byRecent;
            return a.jid.localeCompare(b.jid);
        });
        return chats;
    });

    const contacts = createMemo<ContactProfile[]>(() => {
        const selfJid = toBareJid(creds()?.jid);
        return Object.values(contactsByJid)
            .filter((contact) => contact.jid !== selfJid)
            .sort((a, b) => {
                const aOnline = a.presence !== 'offline';
                const bOnline = b.presence !== 'offline';
                if (aOnline !== bOnline) return bOnline ? 1 : -1;
                return (a.name || a.jid).localeCompare(b.name || b.jid);
            });
    });

    const profile = createMemo<ContactProfile | undefined>(() => {
        const selfJid = toBareJid(creds()?.jid);
        if (!selfJid) return undefined;
        return contactsByJid[selfJid] || {
            jid: selfJid,
            presence: normalizePresence(settings().presence.show),
            statusText: settings().presence.status,
        };
    });

    const hasOlderMessages = (conversationJid: string) => {
        return Boolean(conversationMeta[conversationJid]?.hasOlder);
    };

    const contactTrust = createMemo<ContactTrustSummary[]>(() => {
        const store = trustStore();
        if (!store) return [];

        for (const [jid, contactState] of Object.entries(store.trustByContact)) {
            void jid;
            for (const deviceId of Object.keys(contactState.devices)) {
                void deviceId;
                void contactState.devices[Number(deviceId)]?.level;
            }
        }

        return store.listContactTrust();
    });

    const value: AuthContextType = {
        isAuthed,
        isConnecting,
        isBootstrapping,
        isSyncing,
        jid: () => creds()?.jid,
        resource: () => settings().resource,
        profile,
        contacts,
        presence: () => settings().presence,
        login,
        logout,
        setResource,
        privateChats,
        messagesFor,
        loadLatestMessages,
        loadOlderMessages,
        hasOlderMessages,
        markConversationRead,
        sendChat,
        setPresence,
        pendingSubscriptions,
        acceptSubscription,
        denySubscription,
        addContact,
        omemo: {
            manager: omemoManager,
            canUse: omemoAvailable,
            setEnabled: (enabled) => setOmemoEnabled(enabled),
            isEnabled: omemoEnabled,
            deviceIds: omemoDeviceIds,
            refreshDeviceList: refreshOmemoDeviceList,
            publishDeviceList: publishOmemoDeviceList,
            republish: republishOmemo,
            regenerateIdentity: async () => {
                const m = omemoManager();
                if (!m) return;
                m.clear();
                await m.initialize();
                setOmemoDeviceIds([]);
                try {
                    const devices = await m.ensurePublished();
                    setOmemoDeviceIds(devices);
                } catch {
                    await refreshOmemoDeviceList();
                }
            },
        },
        encryption: {
            getChatEncryption,
            setChatEncryption,
            setChatEncryptionEnabled,
            setChatEncryptionMechanism,
            getDeviceTrust,
            setDeviceTrust,
            cycleDeviceTrust,
            isContactTrusted,
            contactTrust,
            getKnownContactDevices,
            refreshContactDevices,
            fetchContactDevices,
            recordKey,
        },
    };

    if (import.meta.env.DEV) {
        createEffect(() => {
            const c = client();
            const manager = omemoManager();
            if (!c || !manager) return;

            (window as any).__vcXmppDebug = {
                client: c,
                omemo: manager,
                republish: () => republishOmemo(),
                deviceId: () => manager.getDeviceId(),
                fetchOwnDeviceList: () => c.getItems('', NS_OMEMO_DEVICELIST, { max: 1 }),
                fetchOwnBundle: (deviceId: number) =>
                    c.getItems('', `${NS_OMEMO_BUNDLES}:${deviceId}`, { max: 1 }),
                sendTest: (to: string, body: string) => sendChat(to, body),
            };
        });
    }

    return (
        <AuthContext.Provider value={value}>
            {props.children}
        </AuthContext.Provider>
    )
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within <AuthProvider>");
    return context;
}
