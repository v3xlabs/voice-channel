import { useParams } from "@solidjs/router";
import { Component, createSignal, For, Show } from "solid-js";
import { Outcome } from "../../components/command-outcome";
import { JID } from "stanza";
import { useAuth } from "../../auth/provider";
import { useGuilds } from "../../guilds/provider";
import { guildChannels } from "../../xmpp/guild";
import { guildCommand, runCommand, type CommandOutcome } from "../../xmpp/commands";

const AFFILIATIONS = ['member', 'admin', 'owner', 'none'] as const;
type Affiliation = (typeof AFFILIATIONS)[number];
const toAffiliation = (value: string): Affiliation => AFFILIATIONS.find((entry) => entry === value) ?? 'member';

/** Guild overview with the administration the daemon offers. Non-admins get refusals from the daemon. */
export const ServerOverviewRoute: Component = () => {
    const params = useParams<{ groupId: string }>();
    const { guild, ownAffiliation } = useGuilds();
    const canAdminister = () => ['owner', 'admin'].includes(ownAffiliation(params.groupId) ?? '');
    const { client, jid } = useAuth();
    const component = () => `vc.${JID.getDomain(jid() ?? '')}`;

    const [membership, setMembership] = createSignal<CommandOutcome>();
    const [channelOutcome, setChannelOutcome] = createSignal<CommandOutcome>();
    const [memberOutcome, setMemberOutcome] = createSignal<CommandOutcome>();
    const [category, setCategory] = createSignal('Text');
    const [kind, setKind] = createSignal<'text' | 'voice'>('text');
    const [channelName, setChannelName] = createSignal('');
    const [memberJid, setMemberJid] = createSignal('');
    const [affiliation, setAffiliation] = createSignal<Affiliation>('member');

    const run = async (name: string, fields: { name: string; value: string }[]) => {
        const c = client();
        if (!c) return { ok: false as const, error: 'not connected' };
        return runCommand(c, component(), guildCommand(name), [{ name: 'slug', value: params.groupId }, ...fields]);
    };

    return (
        <div class="flex-1 min-w-0 h-screen overflow-y-auto bg-neutral-900">
        <div class="p-6 space-y-6 max-w-2xl">
            <Show when={guild(params.groupId)} fallback={<p class="text-neutral-400">Loading guild {params.groupId}</p>}>
                {(entry) => (
                    <>
                        <div>
                            <h1 class="text-xl font-bold">{entry().name}</h1>
                            <p class="mt-1 text-sm text-neutral-400">{entry().description ?? 'Pick a channel from the sidebar.'}</p>
                            <div class="mt-3 flex items-center gap-2">
                                <button class="button button-secondary" onClick={() => void run('join', []).then(setMembership)}>Join guild</button>
                                <button class="button button-tertiary" onClick={() => void run('leave', []).then(setMembership)}>Leave guild</button>
                                <Outcome outcome={membership()} />
                            </div>
                        </div>

                        <Show when={canAdminister()}>
                        <section class="card space-y-3">
                            <h2 class="font-semibold">Channels</h2>
                            <ul class="text-sm text-neutral-300 space-y-1">
                                <For each={guildChannels(entry())}>
                                    {(channel) => (
                                        <li class="flex items-center justify-between gap-2">
                                            <span>{channel.kind === 'voice' ? 'voice' : 'text'} · {channel.name} <span class="text-neutral-500 text-xs">{channel.jid}</span></span>
                                            <button class="button button-tertiary text-xs" onClick={() => void run('channels', [{ name: 'action', value: 'remove' }, { name: 'category', value: '' }, { name: 'name', value: channel.name }]).then(setChannelOutcome)}>Remove</button>
                                        </li>
                                    )}
                                </For>
                            </ul>
                            <div class="flex gap-2 flex-wrap">
                                <input class="input w-32" placeholder="category" value={category()} onInput={(e) => setCategory(e.currentTarget.value)} />
                                <select class="input" value={kind()} onChange={(e) => setKind(e.currentTarget.value === 'voice' ? 'voice' : 'text')}>
                                    <option value="text">text</option>
                                    <option value="voice">voice</option>
                                </select>
                                <input class="input flex-1 min-w-40" placeholder="channel name" value={channelName()} onInput={(e) => setChannelName(e.currentTarget.value)} />
                                <button class="button button-secondary" onClick={() => void run('channels', [
                                    { name: 'action', value: 'add' }, { name: 'category', value: category() }, { name: 'kind', value: kind() }, { name: 'name', value: channelName() },
                                ]).then((outcome) => { setChannelOutcome(outcome); if (outcome.ok) setChannelName(''); })}>Add channel</button>
                            </div>
                            <p class="text-xs text-neutral-500">Reload to see channel changes in the sidebar.</p>
                            <Outcome outcome={channelOutcome()} />
                        </section>

                        <section class="card space-y-3">
                            <h2 class="font-semibold">Members</h2>
                            <div class="flex gap-2 flex-wrap">
                                <input class="input flex-1 min-w-48" placeholder="someone@example.org" value={memberJid()} onInput={(e) => setMemberJid(e.currentTarget.value)} />
                                <select class="input" value={affiliation()} onChange={(e) => setAffiliation(toAffiliation(e.currentTarget.value))}>
                                    <option value="member">member</option>
                                    <option value="admin">admin</option>
                                    <option value="owner">owner</option>
                                    <option value="none">remove</option>
                                </select>
                                <button class="button button-secondary" onClick={() => void run('members', [{ name: 'jid', value: memberJid() }, { name: 'affiliation', value: affiliation() }]).then(setMemberOutcome)}>Apply</button>
                            </div>
                            <Outcome outcome={memberOutcome()} />
                        </section>
                        </Show>
                    </>
                )}
            </Show>
        </div>
        </div>
    )
};
