import { useParams } from "@solidjs/router";
import { BsHash } from "solid-icons/bs";
import { createResource, Show, Suspense, For } from "solid-js";
import { useAuth } from "../auth/provider";
import type { components } from '../schema.gen';
import { ContextMenu } from "@kobalte/core/context-menu";
import { IdIcon } from "../../public/icon";

type Channel = components['schemas']['Channel'];

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
    const params = useParams<{ groupId: string, channelId: string }>();
    const { fetchApi } = useAuth();
    const [channels] = createResource(async () => {
        return (await fetchApi()('/channels', 'get', {})).data;
    });

    return (
        <Show when={params.groupId}>
            <div class="w-full">
                <h1 class="p-4">Server Channels</h1>
                <Suspense
                    fallback={
                        <div class="space-y-2 w-full">
                            {
                                Array.from({ length: 10 }).map((_, index) => (
                                    <div class="w-full h-10 bg-neutral-700 rounded-md animate-pulse"></div>
                                ))
                            }
                        </div>
                    }>
                    <Show when={channels()} keyed>
                        <ul>
                            <For each={channels()}>
                                {(channel) =>
                                    <ChannelItem channel={channel} active={channel.channel_id === params.channelId} />
                                }
                            </For>
                        </ul>
                    </Show>
                </Suspense>
            </div>
        </Show>
    )
};
