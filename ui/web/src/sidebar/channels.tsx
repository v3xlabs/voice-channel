import { useLocation, useParams, useSearchParams } from "@solidjs/router";
import { BsHash, BsArrowRepeat, BsVolumeUp } from "solid-icons/bs";
import { Show, For } from "solid-js";
import { ContextMenu } from "@kobalte/core/context-menu";
import { IdIcon } from "../icon";
import { useAuth } from "../auth/provider";
import { Jid } from "../components/jid";
import { Avatar } from "../components/avatar";
import { useGuilds } from "../guilds/provider";
import type { GuildChannel } from "../xmpp/guild";

/** Who is in a voice channel's call, shown under the channel like a Discord voice channel. */
const CallMembers = (props: { roomJid: string }) => {
    const { room } = useGuilds();
    const members = () => Object.values(room(props.roomJid)?.occupants ?? {}).filter((occupant) => occupant.call);
    return (
        <Show when={members().length > 0}>
            <ul class="pl-10 pb-1 space-y-0.5">
                <For each={members()}>
                    {(occupant) => (
                        <li class="flex items-center gap-2 text-xs text-neutral-400">
                            <Avatar jid={occupant.jid} name={occupant.nick} size={16} />
                            <span class="truncate">{occupant.nick}</span>
                            <Show when={occupant.call?.voice.muted}><span class="text-neutral-600">muted</span></Show>
                        </li>
                    )}
                </For>
            </ul>
        </Show>
    );
};

const ChannelItem = (props: { slug: string, channel: GuildChannel, active: boolean }) => {
    return (
        <ContextMenu>
            <ContextMenu.Trigger>

                <li
                    classList={{
                        'h-10 px-4': true,
                        'bg-neutral-600 hover:bg-neutral-600': props.active,
                        'hover:bg-neutral-700': !props.active,
                    }}
                >
                    <a
                        href={`/server/${props.slug}/${props.channel.name}`}
                        classList={{
                            "w-full h-full flex items-center gap-0.5": true,
                            "text-neutral-400 hover:text-white": !props.active,
                            "text-white": props.active,
                        }}
                    >
                        <Show when={props.channel.kind === 'voice'} fallback={<BsHash class="text-xl" />}>
                            <BsVolumeUp class="text-xl" />
                        </Show>
                        {props.channel.name}
                    </a>
                </li>
            </ContextMenu.Trigger>
            <ContextMenu.Portal>
                <ContextMenu.Content class="context-menu__content">
                <ContextMenu.Item class="context-menu__item" disabled>
                            Mark as Read
                        </ContextMenu.Item>
                        <ContextMenu.Separator class="context-menu__separator" />
                        <ContextMenu.Item class="context-menu__item">
                            Invite to Channel
                        </ContextMenu.Item>
                        <ContextMenu.Separator class="context-menu__separator" />
                        <ContextMenu.Item class="context-menu__item">
                            Mute Channel
                        </ContextMenu.Item>
                        <ContextMenu.Item class="context-menu__item">
                            Notification settings
                        </ContextMenu.Item>
                        <ContextMenu.Separator class="context-menu__separator" />
                        <ContextMenu.Item class="context-menu__item justify-between">
                            <span>
                                Copy Channel ID
                            </span>
                            <IdIcon />
                        </ContextMenu.Item>
                </ContextMenu.Content>
            </ContextMenu.Portal>
        </ContextMenu>
    )
}

const PendingInvites = () => {
    const { pendingSubscriptions, acceptSubscription, denySubscription } = useAuth();
    const invites = () => pendingSubscriptions();

    return (
        <Show when={invites().length > 0}>
            <div class="px-2 pb-3">
                <p class="px-2 pb-2 text-[11px] uppercase tracking-wide text-neutral-500">Contact requests</p>
                <ul class="space-y-2">
                    <For each={invites()}>
                        {(contact) => (
                            <li class="rounded-md border border-yellow-700/50 bg-yellow-950/20 px-3 py-2">
                                <div class="flex items-center gap-2 mb-2">
                                    <Avatar jid={contact.jid} name={contact.name} src={contact.avatarUrl} size={24} />
                                    <Jid jid={contact.jid} class="text-sm truncate" localClass="text-white" domainClass="opacity-90" />
                                </div>
                                <div class="flex gap-2">
                                    <button
                                        class="button button-secondary text-xs flex-1"
                                        onClick={() => acceptSubscription(contact.jid)}
                                    >
                                        Accept
                                    </button>
                                    <button
                                        class="button button-tertiary text-xs flex-1"
                                        onClick={() => denySubscription(contact.jid)}
                                    >
                                        Decline
                                    </button>
                                </div>
                            </li>
                        )}
                    </For>
                </ul>
            </div>
        </Show>
    );
};

export const ServerChannels = () => {
    const location = useLocation();
    const params = useParams<{ groupId: string, channelId: string }>();
    const [search] = useSearchParams<{ chat?: string }>();
    const { privateChats, isSyncing } = useAuth();
    const { guild } = useGuilds();
    const isMessagesRoute = () => location.pathname.startsWith('/messages');
    const activeChat = () => search.chat || privateChats()[0]?.jid || '';
    const categories = () => guild(params.groupId)?.categories ?? [];

    return (
        <Show when={isMessagesRoute() || params.groupId}>
            <div class="w-full">
                <Show when={isMessagesRoute()} fallback={<h1 class="p-4 truncate">{guild(params.groupId)?.name ?? params.groupId}</h1>}>
                    <div class="flex items-center justify-between p-4">
                        <h1>Messages</h1>
                        <Show when={isSyncing()}>
                            <BsArrowRepeat class="animate-spin text-cyan-400" />
                        </Show>
                    </div>
                </Show>

                <Show when={!isMessagesRoute()}>
                    <Show when={categories().length > 0} fallback={<p class="px-4 text-neutral-400 text-sm">No channels in this guild yet.</p>}>
                        <For each={categories()}>
                            {(category) => (
                                <div class="pb-2">
                                    <p class="px-4 pt-2 pb-1 text-[11px] uppercase tracking-wide text-neutral-500">{category.name}</p>
                                    <ul>
                                        <For each={category.channels}>
                                            {(channel) =>
                                                <>
                                                    <ChannelItem slug={params.groupId} channel={channel} active={channel.name === params.channelId} />
                                                    <Show when={channel.kind === 'voice'}>
                                                        <CallMembers roomJid={channel.jid} />
                                                    </Show>
                                                </>
                                            }
                                        </For>
                                    </ul>
                                </div>
                            )}
                        </For>
                    </Show>
                </Show>

                <Show when={isMessagesRoute()}>
                    <PendingInvites />
                    <Show when={privateChats().length > 0} fallback={<p class="px-4 text-neutral-400 text-sm">No private chats yet.</p>}>
                        <ul class="px-2 pb-2 space-y-1">
                            <For each={privateChats()}>
                                {(chat) => (
                                    <li>
                                        <a
                                            href={`/messages?chat=${encodeURIComponent(chat.jid)}`}
                                            class="block rounded-md border border-neutral-800 px-3 py-2 hover:bg-neutral-700"
                                            classList={{ "bg-neutral-700 border-cyan-600": activeChat() === chat.jid }}
                                        >
                                            <div class="flex items-center gap-2">
                                                <Avatar jid={chat.jid} name={chat.name} src={chat.avatarUrl} size={26} />
                                                <div class="min-w-0 flex-1">
                                                    <div class="flex items-center justify-between gap-2">
                                                        <Jid jid={chat.jid} class="truncate text-sm" localClass="text-white" domainClass="opacity-90" />
                                                        <Show when={chat.unreadCount > 0}>
                                                            <span class="min-w-5 h-5 rounded-full bg-cyan-700 text-white text-xs inline-flex items-center justify-center px-1">
                                                                {chat.unreadCount}
                                                            </span>
                                                        </Show>
                                                    </div>
                                                    <p class="truncate text-xs text-neutral-400">{chat.lastMessage?.body || chat.statusText || 'No messages yet'}</p>
                                                </div>
                                            </div>
                                        </a>
                                    </li>
                                )}
                            </For>
                        </ul>
                    </Show>
                </Show>
            </div>
        </Show>
    )
};
