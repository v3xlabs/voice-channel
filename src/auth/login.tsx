import type { Component } from "solid-js";
import { useAuth } from "./provider";
import { createSignal } from "solid-js";

export const Login: Component = () => {
    const { login } = useAuth();
    const [jid, setJid] = createSignal<string>('');
    const [password, setPassword] = createSignal<string>('');

    const handleLogin = () => {
        login(jid(), password());
    };

    return (
        <div class="w-full h-screen bg-neutral-900">
            <div class="p-2 w-full max-w-md mx-auto pt-10">
                <div class="card space-y-4">
                    <h1>Welcome to my cute login screen</h1>
                    <input type="text" value={jid()} onChange={(e) => setJid(e.target.value)} placeholder="JID" />
                    <input type="password" value={password()} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
                    <button onClick={handleLogin} class="button w-full">Login</button>
                </div>
            </div>
        </div>
    );
};
