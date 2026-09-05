import type { Component } from "solid-js";
import { useAccounts } from "./accounts";
import { createSignal, Match, Switch } from "solid-js";

export const Login: Component = () => {
    const [method, setMethod] = createSignal<'guest' | 'account' | 'xmpp' | ''>('');

    return (
        <div class="w-full h-screen bg-neutral-900">
            <div class="p-2 w-full max-w-md mx-auto pt-10">
                <div class="card space-y-6">
                    <div class="mx-auto w-fit">
                        <img src="/logo.svg" alt="Voice Channel" class="w-10 h-10" />
                    </div>
                    <h1 class="text-center font-bold text-xl">Join the voice channel</h1>
                    <Switch>
                        <Match when={method() === 'xmpp'}>
                            <XMPPLoginForm />
                        </Match>
                        <Match when={method() === 'account'}>
                            {/* <AccountLoginForm /> */}
                            <></>
                        </Match>
                        <Match when={method() === 'guest'}>
                            {/* <GuestLoginForm /> */}
                            <></>
                        </Match>
                        <Match when={!method()}>
                            <div class="space-y-2">
                                <a href="/auth/guest" class="button button-primary w-full block">Continue as guest</a>
                                <a href="/auth/login" class="button button-secondary w-full block">Continue with account</a>
                                <div class="flex items-center gap-4">
                                    <div class="flex-1 h-px bg-neutral-700">

                                    </div>
                                    <div class="text-center text-neutral-400">
                                        or
                                    </div>
                                    <div class="flex-1 h-px bg-neutral-700">

                                    </div>
                                </div>
                                <button onClick={() => setMethod('xmpp')} class="button button-tertiary w-full block">Continue with XMPP</button>
                            </div>
                        </Match>
                    </Switch>
                </div>
            </div>
        </div>
    );
};

export const XMPPLoginForm: Component<{ onDone?: () => void }> = (props) => {
    const { addAccount, setActive } = useAccounts();
    const [jid, setJid] = createSignal<string>('');
    const [password, setPassword] = createSignal<string>('');

    // Activating an account remounts the router, so the navigation must land first.
    const handleLogin = () => {
        const key = addAccount(jid(), password());
        if (!key) return;
        props.onDone?.();
        setTimeout(() => setActive(key), 0);
    };

    return (
        <div class="space-y-2">
            <input type="text" value={jid()} onChange={(e) => setJid(e.target.value)} placeholder="JID" class="input w-full" />
            <input type="password" value={password()} onChange={(e) => setPassword(e.target.value)} placeholder="Password" class="input w-full" />
            <button onClick={handleLogin} class="button button-secondary w-full">Login</button>
        </div>
    );
};
