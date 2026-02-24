import { Accessor, createContext, createEffect, createMemo, createSignal, useContext, type ParentComponent } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { Agent, createClient } from 'stanza';
import type { Credentials } from 'stanza/lib/sasl';

export type User = {
    id: string;
    name: string;
    email: string;
};

export const fetchUser = (token: string | null) => async (): Promise<User | undefined> => {
    // TODO: implement
    if (!token) return undefined;

    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
        id: '123',
        name: 'John Doe',
        email: 'john.doe@example.com',
    };
};

export type AuthContextType = {
    isAuthed: Accessor<boolean>;
    isConnecting: Accessor<boolean>;
    jid: Accessor<string | undefined>;
    resource: Accessor<string>;
    login: (jid: string, password: string) => void;
    logout: () => void;
    setResource: (resource: string) => void;
    privateChats: Accessor<PrivateChatSummary[]>;
    messagesFor: (conversationJid: string) => XmppMessage[];
    loadLatestMessages: (conversationJid: string, max?: number) => Promise<void>;
    loadOlderMessages: (conversationJid: string, max?: number) => Promise<void>;
    hasOlderMessages: (conversationJid: string) => boolean;
    markConversationRead: (conversationJid: string) => void;
    sendChat: (to: string, body: string) => string | undefined;
    omemo: {
        canUse: Accessor<boolean>;
        setEnabled: (enabled: boolean) => void;
        isEnabled: Accessor<boolean>;
        deviceIds: Accessor<number[]>;
        refreshDeviceList: () => Promise<void>;
        publishDeviceList: (deviceIds: number[]) => Promise<void>;
    };
};

const AuthContext = createContext<AuthContextType>();

const VC_CRED_KEY = '@vc/xmpp-credentials';
const VC_SETTINGS_KEY = '@vc/xmpp-settings';
const VC_READ_STATE_PREFIX = '@vc/xmpp-read-state';
const VC_MESSAGES_PREFIX = '@vc/xmpp-messages';
const DEFAULT_RESOURCE = 'voice-channel-web';

type PersistedCred = {
    jid: string;
    credentials: Credentials;
};

type XmppSettings = {
    resource: string;
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
    lastMessage?: XmppMessage;
    unreadCount: number;
    lastReadAt?: number;
    hasOlder: boolean;
};

type ConversationMeta = {
    unreadCount: number;
    lastReadAt?: number;
    mamBefore?: string;
    hasOlder: boolean;
};

const NS_OMEMO_DEVICELIST = 'eu.siacs.conversations.axolotl.devicelist';
const NS_OMEMO_AXOLOTL = 'eu.siacs.conversations.axolotl';
const OMEMO_DEVICELIST_ITEM_ID = 'current';

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

const getMessageBody = (msg: any) => {
    if (typeof msg?.body === 'string' && msg.body.trim().length > 0) return msg.body;
    const firstAlternate = msg?.alternateLanguageBodies?.[0];
    if (firstAlternate?.value) return String(firstAlternate.value);
    return '';
};

export const AuthProvider: ParentComponent = (props) => {
    const [creds, setCredentials] = createSignal<PersistedCred | undefined>(
        sanitizePersistedCred(parseJSON<PersistedCred | undefined>(localStorage.getItem(VC_CRED_KEY), undefined))
    );
    const [settings, setSettings] = createSignal<XmppSettings>(
        parseJSON<XmppSettings>(localStorage.getItem(VC_SETTINGS_KEY), { resource: DEFAULT_RESOURCE })
    );
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
    const [hasSession, setHasSession] = createSignal(false);
    const [client, setClient] = createSignal<Agent | undefined>(undefined);
    const [rosterJids, setRosterJids] = createSignal<string[]>([]);
    const [messagesByConversation, setMessagesByConversation] = createStore<Record<string, XmppMessage[]>>({});
    const [conversationMeta, setConversationMeta] = createStore<Record<string, ConversationMeta>>({});
    const [omemoAvailable, setOmemoAvailable] = createSignal(false);
    const [omemoEnabled, setOmemoEnabled] = createSignal(false);
    const [omemoDeviceIds, setOmemoDeviceIds] = createSignal<number[]>([]);
    const seenMessageIds = new Set<string>();

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
        setRosterJids((prev) => Array.from(new Set([...prev, ...Object.keys(sanitized)])));
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

    const recordMessage = (incoming: any, archived: boolean, source: 'incoming' | 'outgoing' = 'incoming') => {
        const c = creds();
        if (!c) return;

        const body = getMessageBody(incoming);
        if (!body) return;

        const self = toBareJid(c.jid);
        const from = toBareJid(incoming.from) || (source === 'outgoing' ? self : '');
        const to = toBareJid(incoming.to) || (source === 'incoming' ? self : '');
        const conversationJid = source === 'outgoing' ? to : (from === self ? to : from);
        if (!conversationJid) return;

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
        let merged = false;
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
                merged = true;
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

        if (merged && archived && source === 'incoming') {
            setMessagesByConversation(conversationJid, (current = []) => [...current].sort((a, b) => a.timestamp - b.timestamp));
        }
    };

    const extractForwardedMessage = (archiveResult: any) => {
        if (!archiveResult) return undefined;
        if (archiveResult.item?.message) return archiveResult.item.message;
        if (archiveResult.forwarded?.message) return archiveResult.forwarded.message;
        return archiveResult.message;
    };

    const applyMAMResults = (results: any[] | undefined) => {
        if (!results?.length) return;
        for (const item of results) {
            const forwarded = extractForwardedMessage(item);
            if (!forwarded) continue;
            if (forwarded.type && forwarded.type !== 'chat') continue;
            recordMessage(forwarded, true, 'incoming');
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

    const detectOmemoSupport = async (xmpp: Agent, accountJid: string) => {
        try {
            const info = await xmpp.getDiscoInfo(toBareJid(accountJid));
            const features = (info?.features || []).map((item: any) => item?.var || item).filter(Boolean);
            setOmemoAvailable(features.includes(NS_OMEMO_DEVICELIST));
        } catch {
            setOmemoAvailable(false);
        }
    };

    const refreshOmemoDeviceList = async () => {
        const xmpp = client();
        const accountJid = creds()?.jid;
        if (!xmpp || !accountJid) return;

        try {
            const response = await xmpp.getItems(toBareJid(accountJid), NS_OMEMO_DEVICELIST, { max: 1 } as any);
            const item = response?.items?.[0] as any;
            const devices = item?.content?.devices || [];
            setOmemoDeviceIds(devices);
        } catch {
            setOmemoDeviceIds([]);
        }
    };

    const publishOmemoDeviceList = async (deviceIds: number[]) => {
        const xmpp = client();
        const accountJid = creds()?.jid;
        if (!xmpp || !accountJid || !omemoAvailable()) return;

        await xmpp.publish(
            toBareJid(accountJid),
            NS_OMEMO_DEVICELIST,
            {
                itemType: NS_OMEMO_DEVICELIST,
                devices: Array.from(new Set(deviceIds)).sort((a, b) => a - b),
            } as any,
            OMEMO_DEVICELIST_ITEM_ID
        );

        setOmemoDeviceIds(Array.from(new Set(deviceIds)).sort((a, b) => a - b));
    };

    const setupClient = (reason: 'login' | 'restore' | 'resource-change') => {
        const { jid, credentials } = creds() ?? {};
        if (!jid || !credentials) return undefined;

        const c = createClient({
            jid,
            credentials,
            autoReconnect: true,
            useStreamManagement: true,
            allowResumption: true,
            resource: settings().resource,
        });

        client()?.disconnect();
        setClient(c);
        setIsConnecting(true);
        setHasSession(false);

        c.on('connected', () => {
            setIsConnecting(false);
        });

        c.on('auth:success', () => {
            setIsAuthed(true);
            setIsConnecting(false);
        });

        c.on('auth:failed', () => {
            setIsAuthed(false);
            setIsConnecting(false);
        });

        c.on('session:started', async () => {
            setHasSession(true);

            try {
                await c.enableCarbons();
            } catch (e) {
                console.error('Failed to enable carbons', e);
            }

            try {
                const roster = await c.getRoster();
                const ids = (roster?.items || []).map((item: any) => toBareJid(item.jid)).filter(Boolean);
                setRosterJids(ids);
            } catch (e) {
                console.error('Failed to load roster', e);
            }

            c.updateCaps();
            c.sendPresence({ show: 'chat', status: 'Voice Channel online' });
            await detectOmemoSupport(c, jid);
            await refreshOmemoDeviceList();
            await loadRecentConversations(c);
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
            const ids = items.map((item: any) => toBareJid(item.jid)).filter(Boolean);
            if (ids.length > 0) setRosterJids((prev) => Array.from(new Set([...prev, ...ids])));
        });

        c.on('chat', (msg: any) => {
            recordMessage(msg, false, 'incoming');
        });

        c.on('mam:item', (msg: any) => {
            recordMessage(msg, true, 'incoming');
        });

        c.on('carbon:received', (payload: any) => {
            const forwarded = payload?.carbonReceived?.forwarded?.message || payload?.forwarded?.message;
            if (forwarded) recordMessage(forwarded, false, 'incoming');
        });

        c.on('carbon:sent', (payload: any) => {
            const forwarded = payload?.carbonSent?.forwarded?.message || payload?.forwarded?.message;
            if (forwarded) recordMessage(forwarded, false, 'outgoing');
        });

        c.on('message:sent', (msg: any) => {
            recordMessage(msg, false, 'outgoing');
        });

        c.connect();

        return reason;
    };

    if (creds()) setupClient('restore');

    const login = (jid: string, password: string) => {
        const trimmedJid = jid.trim();
        if (!trimmedJid || !password) return;
        setCredentials({
            jid: trimmedJid,
            credentials: sanitizeCredentials({
                password,
            }),
        });
        setupClient('login');
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
        client()?.disconnect();
        setClient(undefined);
        setCredentials(undefined);
        setRosterJids([]);
        clearMessages();
        setHasSession(false);
        setIsAuthed(false);
        setIsConnecting(false);
        setOmemoDeviceIds([]);
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

        const result = await c.searchHistory({
            with: conversationJid,
            paging: { max },
        } as any);

        applyMAMResults((result as any)?.results);
        applyMAMPaging(conversationJid, result, 'latest');
    };

    const loadOlderMessages = async (conversationJid: string, max = 30) => {
        const c = client();
        const before = conversationMeta[conversationJid]?.mamBefore;
        if (!c || !hasSession() || !conversationJid || !before) return;

        const result = await c.searchHistory({
            with: conversationJid,
            paging: { max, before },
        } as any);

        applyMAMResults((result as any)?.results);
        applyMAMPaging(conversationJid, result, 'older');
    };

    const sendChat = (to: string, body: string) => {
        const c = client();
        const trimmedBody = body.trim();
        if (!c || !trimmedBody) return undefined;

        const id = c.sendMessage({
            to,
            type: 'chat',
            body: trimmedBody,
            encryptionMethod: omemoEnabled() && omemoAvailable()
                ? { id: NS_OMEMO_AXOLOTL, name: 'OMEMO' }
                : undefined,
        } as any);

        return id;
    };

    const setResource = (resource: string) => {
        const nextResource = resource.trim();
        if (!nextResource) return;
        setSettings((prev) => ({ ...prev, resource: nextResource }));
    };

    createEffect((previousResource) => {
        const currentResource = settings().resource;
        if (previousResource !== undefined && previousResource !== currentResource && creds()) {
            setupClient('resource-change');
        }
        return currentResource;
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
        const ids = new Set<string>([...rosterJids(), ...Object.keys(messagesByConversation)]);
        const chats = Array.from(ids)
            .filter(Boolean)
            .map((jid) => {
                const items = messagesByConversation[jid] || [];
                const lastMessage = items.length > 0 ? items[items.length - 1] : undefined;
                return {
                    jid,
                    lastMessage,
                    unreadCount: conversationMeta[jid]?.unreadCount || 0,
                    lastReadAt: conversationMeta[jid]?.lastReadAt,
                    hasOlder: conversationMeta[jid]?.hasOlder || false,
                };
            });
        chats.sort((a, b) => (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0));
        return chats;
    });

    const hasOlderMessages = (conversationJid: string) => {
        return Boolean(conversationMeta[conversationJid]?.hasOlder);
    };

    const value: AuthContextType = {
        isAuthed,
        isConnecting,
        jid: () => creds()?.jid,
        resource: () => settings().resource,
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
        omemo: {
            canUse: omemoAvailable,
            setEnabled: (enabled) => setOmemoEnabled(enabled),
            isEnabled: omemoEnabled,
            deviceIds: omemoDeviceIds,
            refreshDeviceList: refreshOmemoDeviceList,
            publishDeviceList: publishOmemoDeviceList,
        },
    };

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
