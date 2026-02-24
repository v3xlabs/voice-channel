import { useLocation, useParams, useSearchParams } from "@solidjs/router";
import { BsHash } from "solid-icons/bs";
import { Show, For } from "solid-js";
import { ContextMenu } from "@kobalte/core/context-menu";
import { IdIcon } from "../../public/icon";
import { useAuth } from "../auth/provider";

type Channel = {
    channel_id: string;
    group_id: string;
    name: string;
};

const CHANNELS: Channel[] = [
    { channel_id: 'chat', group_id: '1', name: 'chat' },
    { channel_id: 'general', group_id: '1', name: 'general' },
    { channel_id: 'support', group_id: '1', name: 'support' },
    { channel_id: 'voice', group_id: '2', name: 'voice' },
    { channel_id: 'clips', group_id: '2', name: 'clips' },
    { channel_id: 'random', group_id: '3', name: 'random' },
    { channel_id: 'qa', group_id: '3', name: 'qa' },
    { channel_id: 'chat', group_id: '4', name: 'chat' },
    { channel_id: 'voice', group_id: '5', name: 'voice' },
    { channel_id: 'main', group_id: '6', name: 'main' },
];

const ChannelItem = (props: { channel: Channel, active: boolean }) => {
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
                        href={`/server/${props.channel.group_id}/${props.channel.channel_id}`}
                        classList={{
                            "w-full h-full flex items-center gap-0.5": true,
                            "text-neutral-400 hover:text-white": !props.active,
                            "text-white": props.active,
                        }}
                    >
                        <BsHash class="text-xl" />
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

export const ServerChannels = () => {
    const location = useLocation();
    const params = useParams<{ groupId: string, channelId: string }>();
    const [search] = useSearchParams<{ chat?: string }>();
    const { privateChats } = useAuth();
    const isMessagesRoute = () => location.pathname.startsWith('/messages');
    const activeChat = () => search.chat || '';
    const channels = () => CHANNELS.filter((channel) => channel.group_id === params.groupId);

    return (
        <Show when={isMessagesRoute() || params.groupId}>
            <div class="w-full">
                <Show when={isMessagesRoute()} fallback={<h1 class="p-4">Server Channels</h1>}>
                    <h1 class="p-4">Messages</h1>
                </Show>

                <Show when={!isMessagesRoute()}>
                    <Show when={channels().length > 0} fallback={<p class="px-4 text-neutral-400 text-sm">No channels in this group yet.</p>}>
                        <ul>
                            <For each={channels()}>
                                {(channel) =>
                                    <ChannelItem channel={channel} active={channel.channel_id === params.channelId} />
                                }
                            </For>
                        </ul>
                    </Show>
                </Show>

                <Show when={isMessagesRoute()}>
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
                                            <div class="flex items-center justify-between gap-2">
                                                <p class="truncate text-sm text-white">{chat.jid}</p>
                                                <Show when={chat.unreadCount > 0}>
                                                    <span class="min-w-5 h-5 rounded-full bg-cyan-700 text-white text-xs inline-flex items-center justify-center px-1">
                                                        {chat.unreadCount}
                                                    </span>
                                                </Show>
                                            </div>
                                            <p class="truncate text-xs text-neutral-400">{chat.lastMessage?.body || 'No messages yet'}</p>
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
