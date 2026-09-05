import { createContext, createMemo, createRoot, createSignal, onCleanup, useContext, type Accessor, type ParentComponent } from 'solid-js';
import { Show } from 'solid-js';
import { AuthProvider, VC_CRED_KEY, createAccountSession, type AuthContextType, type PersistedCred } from './provider';
import { GuildProvider } from '../guilds/provider';

const ACCOUNTS_KEY = '@vc/accounts';
const ACTIVE_KEY = '@vc/active-account';

const bare = (jid: string) => jid.split('/')[0] ?? jid;

const parse = <T,>(value: string | null, fallback: T): T => {
    if (!value) return fallback;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
};

/** Earlier builds stored a single credential; it becomes the first entry of the list. */
const loadAccounts = (): PersistedCred[] => {
    const list = parse<PersistedCred[]>(localStorage.getItem(ACCOUNTS_KEY), []);
    if (list.length > 0) return list;
    const single = parse<PersistedCred | undefined>(localStorage.getItem(VC_CRED_KEY), undefined);
    if (!single?.jid) return [];
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([single]));
    localStorage.removeItem(VC_CRED_KEY);
    return [single];
};

type Running = {
    session: AuthContextType;
    dispose: () => void;
};

type AccountsContextType = {
    accounts: Accessor<PersistedCred[]>;
    activeJid: Accessor<string | undefined>;
    /** The running session of the active account, once it exists. */
    active: Accessor<AuthContextType | undefined>;
    setActive: (jid: string) => void;
    /** Starts the session and returns the bare JID. Activating it is the caller's step. */
    addAccount: (jid: string, password: string) => string | undefined;
    removeAccount: (jid: string) => void;
    sessionFor: (jid: string) => AuthContextType | undefined;
};

const AccountsContext = createContext<AccountsContextType>();

export const AccountsProvider: ParentComponent = (props) => {
    const [accounts, setAccounts] = createSignal<PersistedCred[]>(loadAccounts());
    const [activeJid, setActiveJid] = createSignal<string | undefined>(
        localStorage.getItem(ACTIVE_KEY) ?? accounts()[0]?.jid
    );
    const [running, setRunning] = createSignal<Record<string, Running>>({});

    const persist = (list: PersistedCred[]) => {
        setAccounts(list);
        localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
    };

    const start = (cred: PersistedCred) => {
        const key = bare(cred.jid);
        if (running()[key]) return;
        const entry = createRoot((dispose) => {
            const session = createAccountSession(cred, {
                onCredentials: (next) => {
                    persist(accounts().map((entry) => (bare(entry.jid) === key ? next : entry)));
                },
                onLogout: () => removeAccount(key),
            });
            return { session, dispose };
        });
        setRunning((current) => ({ ...current, [key]: entry }));
    };

    const removeAccount = (jid: string) => {
        const key = bare(jid);
        const entry = running()[key];
        entry?.dispose();
        setRunning((current) => {
            const next = { ...current };
            delete next[key];
            return next;
        });
        persist(accounts().filter((entry) => bare(entry.jid) !== key));
        if (activeJid() === key) setActive(accounts()[0]?.jid ?? '');
    };

    const setActive = (jid: string) => {
        const key = bare(jid);
        setActiveJid(key || undefined);
        if (key) localStorage.setItem(ACTIVE_KEY, key);
        else localStorage.removeItem(ACTIVE_KEY);
    };

    const addAccount = (jid: string, password: string) => {
        const trimmed = jid.trim();
        if (!trimmed || !password) return undefined;
        const cred: PersistedCred = { jid: trimmed, credentials: { password } };
        if (!accounts().some((entry) => bare(entry.jid) === bare(trimmed))) {
            persist([...accounts(), cred]);
        }
        start(cred);
        return bare(trimmed);
    };

    for (const cred of accounts()) start(cred);
    onCleanup(() => {
        for (const entry of Object.values(running())) entry.dispose();
    });

    const activeSession = createMemo(() => {
        const key = activeJid();
        return key ? running()[key]?.session : undefined;
    });

    const value: AccountsContextType = {
        accounts,
        activeJid,
        active: activeSession,
        setActive,
        addAccount,
        removeAccount,
        sessionFor: (jid) => running()[bare(jid)]?.session,
    };

    return (
        <AccountsContext.Provider value={value}>
            <Show when={activeSession()} keyed fallback={props.children}>
                {(session) => (
                    <AuthProvider session={session}>
                        <GuildProvider>{props.children}</GuildProvider>
                    </AuthProvider>
                )}
            </Show>
        </AccountsContext.Provider>
    );
};

export const useAccounts = () => {
    const context = useContext(AccountsContext);
    if (!context) throw new Error('useAccounts must be used within <AccountsProvider>');
    return context;
};
