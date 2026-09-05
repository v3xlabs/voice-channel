import { createSignal, Show, type Component } from 'solid-js';
import { useNavigate, useParams } from '@solidjs/router';

import { useAccounts } from '../auth/accounts';
import { inviteUri } from '../xmpp/invite';
import { registerWithInvite } from '../xmpp/register';

/**
 * The web half of a XEP-0401 invite. The token alone identifies it, so the instance is
 * the one serving this page.
 */
export const InviteRoute: Component = () => {
    const params = useParams<{ token: string }>();
    const navigate = useNavigate();
    const { addAccount, setActive } = useAccounts();

    const invite = () => ({ domain: location.hostname, token: params.token });
    const [username, setUsername] = createSignal('');
    const [password, setPassword] = createSignal('');
    const [error, setError] = createSignal<string>();
    const [isCreating, setIsCreating] = createSignal(false);

    const canSubmit = () => username().trim().length > 0 && password().length > 0 && !isCreating();

    const create = async (event: SubmitEvent) => {
        event.preventDefault();
        if (!canSubmit()) return;
        setError(undefined);
        setIsCreating(true);

        const name = username().trim();
        const registration = await registerWithInvite(invite(), name, password());
        setIsCreating(false);
        if (!registration.ok) {
            setError(registration.error);
            return;
        }

        // Activating an account remounts the router, so the navigation must land first.
        const key = addAccount(`${name}@${invite().domain}`, password());
        navigate('/');
        if (key) setTimeout(() => setActive(key), 0);
    };

    return (
        <div class="w-full h-screen overflow-y-auto bg-neutral-900">
            <div class="p-2 w-full max-w-md mx-auto pt-10">
                <div class="card space-y-6">
                    <div class="mx-auto w-fit">
                        <img src="/logo.svg" alt="Voice Channel" class="w-10 h-10" />
                    </div>
                    <div class="space-y-1 text-center">
                        <h1 class="font-bold text-xl">You are invited to {invite().domain}</h1>
                        <p class="text-sm text-neutral-400">
                            Choose a username and a password. The invite works once.
                        </p>
                    </div>

                    <form class="space-y-4" onSubmit={(event) => void create(event)}>
                        <div class="space-y-1">
                            <label class="text-sm text-neutral-300" for="invite-username">Username</label>
                            <div class="flex items-center gap-2">
                                <input
                                    id="invite-username"
                                    class="input flex-1 min-w-0"
                                    autocomplete="username"
                                    value={username()}
                                    onInput={(event) => setUsername(event.currentTarget.value)}
                                />
                                <span class="text-sm text-neutral-400">@{invite().domain}</span>
                            </div>
                        </div>
                        <div class="space-y-1">
                            <label class="text-sm text-neutral-300" for="invite-password">Password</label>
                            <input
                                id="invite-password"
                                class="input w-full"
                                type="password"
                                autocomplete="new-password"
                                value={password()}
                                onInput={(event) => setPassword(event.currentTarget.value)}
                            />
                        </div>
                        <button class="button button-primary w-full" type="submit" disabled={!canSubmit()}>
                            {isCreating() ? 'Creating account...' : 'Create account'}
                        </button>
                        <Show when={error()}>
                            {(message) => <p class="text-sm text-red-300">{message()}</p>}
                        </Show>
                    </form>

                    <div class="border-t border-neutral-700 pt-6">
                        <a class="button button-tertiary w-full block text-center" href={inviteUri(invite())}>
                            Open in XMPP client
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};
