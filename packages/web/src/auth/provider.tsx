import { Accessor, children, createContext, createEffect, createMemo, createResource, createSignal, Resource, useContext, type ParentComponent } from "solid-js";

const TOKEN_KEY = 'voice-channel-token';

export type User = {
    id: string;
    name: string;
    email: string;
};

export const fetchUser = (token: string | null) => async (): Promise<User | null> => {
    // TODO: implement
    if (!token) return null;

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
    user: Resource<User | null>;
};

const AuthContext = createContext<AuthContextType>();

export const AuthProvider: ParentComponent = (props) => {
    const [token, setToken] = createSignal<string | null>(
        localStorage.getItem(TOKEN_KEY)
    );

    createEffect(() => {
        const t = token();
        if (t) localStorage.setItem(TOKEN_KEY, t);
        else localStorage.removeItem(TOKEN_KEY);
    });

    const isAuthed = createMemo(() => token() !== null);

    const [user] = createResource(fetchUser(token()));

    const value: AuthContextType = {
        token,
        isAuthed,
        login: setToken,
        logout: () => setToken(null),
        user,
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
