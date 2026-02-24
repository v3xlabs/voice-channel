import { Accessor, children, Component, createContext, createEffect, createMemo, createResource, createSignal, Resource, useContext, type ParentComponent } from "solid-js";
import type { paths, components } from '../schema.gen';
import { createFetch } from "openapi-hooks";
import { Agent, createClient, type Client } from 'stanza';
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
    login: (jid: string, password: string) => void;
    logout: () => void;
    // fetchApi: Accessor<typeof baseFetch>;
};

const AuthContext = createContext<AuthContextType>();

const baseFetch = createFetch<paths>({
    baseUrl: 'http://localhost:3001/api/',
});

type ConnectionOpts = {
    jid: string;
} & (
        { password: string } | { token: string }
    )

const VC_CRED_KEY = '@vc/cred';
type VC_Cred = {
    jid: string;
    credentials: Credentials;
}

export const AuthProvider: ParentComponent = (props) => {
    const [creds, setCredentials] = createSignal<VC_Cred | undefined>(JSON.parse(localStorage.getItem(VC_CRED_KEY) ?? 'null'));

    createEffect(() => {
        const c = creds();
        if (c) localStorage.setItem(VC_CRED_KEY, JSON.stringify(c));
        else localStorage.removeItem(VC_CRED_KEY);
    });

    const [isAuthed, setIsAuthed] = createSignal(false);
    const [hasSession, setHasSession] = createSignal(false);
    const [client, setClient] = createSignal<Agent | undefined>(undefined);

    const setupClient = () => {
        console.log('creating client');
        const { jid, credentials } = creds() ?? {};

        console.log('creds', creds());

        if (!jid || !credentials) return undefined;

        console.log('creating client with jid', jid, 'and credentials', credentials);

        let c = createClient({
            jid,
            credentials,
            autoReconnect: false,
            resource: 'vc-testing'
        });

        client()?.disconnect();
        setClient(c);

        c.on('auth:success', () => {
            console.log('auth:success');
            setIsAuthed(true);
        });
        c.on('auth:failed', () => {
            console.log('auth:failed');
            setIsAuthed(false);
        });
        c.on('session:started', async () => {
            console.log('session:started');

            setHasSession(true);

            try {
            c.enableCarbons();
            } catch (e) {
                console.error('error enabling carbons, server probably doesnt support lol', e);
            }
            await c.getRoster();
            c.updateCaps();
            c.sendPresence({ show: 'chat', status: 'Echo bot online' });

            const x = await c.getDiscoItems();
            console.log('disco items', x);
            const y = await Promise.allSettled(x.items.map(item => c.getDiscoInfo(item.jid)));
            console.log('disco info', y);
        });
        c.on('session:end', () => {
            console.log('session:end');
            setHasSession(false);
        });

        c.on('credentials:update', (credentials) => {
            console.log('credentials:update', credentials);
            // setCredentials({
            //     jid,
            //     credentials,
            // });
        });
        c.on('chat', (msg) => {
            console.log('chat', msg);
        });
        const rawLog = (...args: any[]) => console.log('[STANZA]', ...args);
        c.on('*', rawLog);

        console.log('connecting...');
        c.connect({
            jid,
            credentials,
        });
    };

    if (creds()) setupClient();

    const login = (jid: string, password: string) => {
        console.log('setting credentials via login');
        setCredentials({
            jid,
            credentials: {
                password,
            },
        });
        setupClient();
    };

    const [user] = createResource(
        () => hasSession() && client(),
        async () => {
            console.log('getting user');
            if (!hasSession() || !client()) return undefined;
            console.log('client', client());
            return {
                // info: await client()?.getAccountInfo(),
                // x: await client()?.getVCard('lucemans@conversations.im'),
                // r: await client()?.
            };
        });

    createEffect(() => {
        console.log('user', user());
    });

    // const fetchApi = createMemo(() => {
    //     const fetcher: typeof baseFetch = (path, method, options) => {
    //         const fetchOptions = options.fetchOptions ?? {};
    //         if (token()) {
    //             fetchOptions.headers = {
    //                 ...fetchOptions.headers,
    //                 'Authorization': `Bearer ${token()}`,
    //             };
    //         }
    //         return baseFetch(path, method, { ...options, fetchOptions });
    //     };

    //     return fetcher;
    // });

    const value: AuthContextType = {
        // token,
        isAuthed,
        login,
        logout: () => setCredentials(undefined),
        // user,
        // fetchApi,
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
