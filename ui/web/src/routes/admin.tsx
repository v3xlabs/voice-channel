import { Component, createSignal, Show } from "solid-js";
import { Outcome, describe } from "../components/command-outcome";
import { JID } from "stanza";
import { useAuth } from "../auth/provider";
import { useGuilds } from "../guilds/provider";
import { guildCommand, instanceCommand, runCommand, type CommandOutcome } from "../xmpp/commands";

/** Instance administration: invites, accounts, guilds. The daemon refuses non-admins. */
export const AdminRoute: Component = () => {
    const { client, jid } = useAuth();
    const { isInstanceAdmin } = useGuilds();
    const component = () => `vc.${JID.getDomain(jid() ?? '')}`;

    const [invite, setInvite] = createSignal<CommandOutcome>();
    const [account, setAccount] = createSignal<CommandOutcome>();
    const [guild, setGuild] = createSignal<CommandOutcome>();
    const [username, setUsername] = createSignal('');
    const [password, setPassword] = createSignal('');
    const [slug, setSlug] = createSignal('');
    const [name, setName] = createSignal('');
    const [description, setDescription] = createSignal('');
    const [isPublic, setIsPublic] = createSignal(true);

    const run = async (node: string, fields: { name: string; value: string }[]) => {
        const c = client();
        if (!c) return { ok: false as const, error: 'not connected' };
        return runCommand(c, component(), node, fields);
    };

    return (
        <Show when={isInstanceAdmin()} fallback={<p class="p-6 text-neutral-400">Only instance admins can open this page.</p>}>
        <div class="flex-1 min-w-0 h-screen overflow-y-auto bg-neutral-900">
        <div class="p-6 space-y-8 max-w-2xl">
            <div>
                <h1 class="text-xl font-bold">Instance administration</h1>
                <p class="text-sm text-neutral-400">Acting as {jid()} on {component()}.</p>
            </div>

            <section class="card space-y-3">
                <h2 class="font-semibold">Invite someone</h2>
                <p class="text-sm text-neutral-400">Creates a one-time account invite. Send the link; it opens in Conversations, Monal, Dino, or any client with XEP-0401.</p>
                <button class="button button-primary" onClick={() => void run(instanceCommand('invite'), []).then(setInvite)}>New invite link</button>
                <Show when={invite()}>
                    {(outcome) => (
                        <Show when={outcome().ok} fallback={<Outcome outcome={outcome()} />}>
                            <input class="input w-full font-mono text-xs" readonly value={describe(outcome())} onFocus={(e) => e.currentTarget.select()} />
                        </Show>
                    )}
                </Show>
            </section>

            <section class="card space-y-3">
                <h2 class="font-semibold">Create an account</h2>
                <div class="flex flex-wrap gap-2">
                    <input class="input flex-1 min-w-40" placeholder="username" value={username()} onInput={(e) => setUsername(e.currentTarget.value)} />
                    <input class="input flex-1 min-w-40" type="password" placeholder="password" value={password()} onInput={(e) => setPassword(e.currentTarget.value)} />
                    <button class="button button-secondary" onClick={() => void run(instanceCommand('account'), [{ name: 'username', value: username() }, { name: 'password', value: password() }]).then((outcome) => { setAccount(outcome); if (outcome.ok) { setUsername(''); setPassword(''); } })}>Create</button>
                </div>
                <Outcome outcome={account()} />
            </section>

            <section class="card space-y-3">
                <h2 class="font-semibold">Create a guild</h2>
                <div class="grid grid-cols-2 gap-2">
                    <input class="input" placeholder="slug, for example v3x" value={slug()} onInput={(e) => setSlug(e.currentTarget.value)} />
                    <input class="input" placeholder="name" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
                    <input class="input col-span-2" placeholder="description" value={description()} onInput={(e) => setDescription(e.currentTarget.value)} />
                    <label class="flex items-center gap-2 text-sm text-neutral-300">
                        <input type="checkbox" checked={isPublic()} onChange={(e) => setIsPublic(e.currentTarget.checked)} />
                        Public: listed on the instance, anyone can join
                    </label>
                    <button class="button button-secondary" onClick={() => void run(guildCommand('create'), [
                        { name: 'slug', value: slug() }, { name: 'name', value: name() }, { name: 'description', value: description() }, { name: 'public', value: isPublic() ? '1' : '0' },
                    ]).then((outcome) => { setGuild(outcome); if (outcome.ok) { setSlug(''); setName(''); setDescription(''); } })}>Create guild</button>
                </div>
                <p class="text-xs text-neutral-500">A new guild starts with a text channel named general. Add channels from the guild's page. Reload to see it in the sidebar.</p>
                <Outcome outcome={guild()} />
            </section>
        </div>
        </div>
        </Show>
    );
};
