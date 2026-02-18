import { Accessor, children, Component, createContext, createEffect, createMemo, createResource, createSignal, Resource, useContext, type ParentComponent } from "solid-js";
import type { paths, components } from '../schema.gen';
import { createFetch } from "openapi-hooks";

const TOKEN_KEY = 'voice-channel-token';

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
    token: Accessor<string | null>;
    isAuthed: Accessor<boolean>;
    login: (token: string) => void;
    logout: () => void;
    user: Resource<User | undefined>;
    fetchApi: Accessor<typeof baseFetch>;
};

const AuthContext = createContext<AuthContextType>();

// @ts-expect-error - weird type error, but works fine
const baseFetch = createFetch<paths>({
    baseUrl: 'http://localhost:3001/api/',
});

export const AuthProvider: ParentComponent = (props) => {
    const [token, setToken] = createSignal<string | null>(
        localStorage.getItem(TOKEN_KEY) || null
    );

    createEffect(() => {
        const t = token();
        if (t) localStorage.setItem(TOKEN_KEY, t);
        else localStorage.removeItem(TOKEN_KEY);
    });

    const isAuthed = createMemo(() => token() !== null);

    const [user] = createResource(fetchUser(token()));

    const fetchApi = createMemo(() => {
        const fetcher: typeof baseFetch = (path, method, options) => {
            const fetchOptions = options.fetchOptions ?? {};
            if (token()) {
                fetchOptions.headers = {
                    ...fetchOptions.headers,
                    'Authorization': `Bearer ${token()}`,
                };
            }
            return baseFetch(path, method, { ...options, fetchOptions });
        };

        return fetcher;
    });

    const value: AuthContextType = {
        token,
        isAuthed,
        login: setToken,
        logout: () => setToken(null),
        user,
        fetchApi,
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
