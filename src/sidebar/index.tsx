import { createMemo, For, ParentComponent, Show } from "solid-js";
import { ServerGroup } from "./server";
import { SidebarSettings } from "./settings";
import { useAuth } from "../auth/provider";
import { SidebarActivity } from "./activity";
import { ServerChannels } from "./channels";
import { BsChatDots } from "solid-icons/bs";
import { Jid } from "../components/jid";
import { Avatar } from "../components/avatar";

export type Server = {
    name: string;
    url: string;
    groups: Group[];
};

export type Group = {
    groupId: string;
    name: string;
    icon?: string;
}

export const Sidebar = () => {
    const { privateChats, profile, presence, setPresence } = useAuth();
    const unreadTotal = createMemo(() => {
        return privateChats().reduce((total, chat) => total + chat.unreadCount, 0);
    });
    const presenceOrder = ['online', 'chat', 'away', 'xa', 'dnd'] as const;
    const nextPresence = () => {
        const current = presence().show;
        const index = presenceOrder.indexOf(current);
        const next = presenceOrder[(index + 1) % presenceOrder.length];
        setPresence({ show: next, status: presence().status });
    };

    const servers: Server[] = [
        {
            name: 'Voice Channel',
            url: 'https://voice.channel',
            groups: [
                {
                    groupId: '1',
                    name: 'V3X Labs',
                    icon: '🔧',
                },
                {
                    groupId: '2',
                    name: 'V3X Gaming',
                    icon: '🎮',
                },
                {
                    groupId: '3',
                    name: 'V3X Testing',
                    icon: '🧪',
                }
            ]
        },
        {
            name: 'Voice Channel',
            url: 'https://voice.channel',
            groups: [
                {
                    groupId: '4',
                    name: 'Jakob\'s Home',
                    icon: '🇸🇪',
                },
                {
                    groupId: '5',
                    name: 'Steve\'s Home',
                    icon: '🏠',
                }
            ]
        },
        {
            name: 'Voice Channel',
            url: 'https://voice.channel',
            groups: [
                {
                    groupId: '6',
                    name: 'General Lounge Server With Long Name That Doesn\'t End',
                    icon: '🏠',
                }
            ]
        }
    ];

    return (
        <div class="h-screen flex relative">
            <div class="w-[72px] bg-neutral-900 h-full flex flex-col gap-2 items-center p-2">
                <div class="relative">
                    <a
                        href="/messages"
                        title="Messages"
                        class="w-10 h-10 rounded-md bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-white"
                    >
                        <BsChatDots />
                    </a>
                    <Show when={unreadTotal() > 0}>
                        <div class="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-cyan-600 text-[11px] flex items-center justify-center">
                            {unreadTotal()}
                        </div>
                    </Show>
                </div>
                <For each={servers}>
                    {(server) => (
                        <ServerGroup server={server} />
                    )}
                </For>
            </div>
            <div class="w-64 bg-neutral-800 h-full flex">
                <ServerChannels />
            </div>
            <div class="absolute bottom-2 left-2 right-2">
                <div class="relative z-0">
                    <SidebarActivity />
                    <div class="p-2 rounded-lg bg-neutral-700 w-full z-50 flex items-center justify-between gap-2 relative">
                        <div class="min-w-0 px-2">
                            <p class="text-[11px] text-neutral-400">Signed in as</p>
                            <Show when={profile()} fallback={<span class="text-sm text-neutral-300">Guest</span>}>
                                <div class="flex items-center gap-2 min-w-0">
                                    <button
                                        class="shrink-0"
                                        onClick={nextPresence}
                                        title="Cycle presence"
                                    >
                                        <Avatar
                                            jid={profile()?.jid}
                                            name={profile()?.name}
                                            src={profile()?.avatarUrl}
                                            presence={profile()?.presence}
                                            size={24}
                                        />
                                    </button>
                                    <div class="min-w-0">
                                        <Jid jid={profile()?.jid || ''} class="text-sm truncate block" localClass="text-white" domainClass="font-medium" />
                                        <p class="text-[11px] text-neutral-400 truncate">{profile()?.statusText || profile()?.presence}</p>
                                    </div>
                                </div>
                            </Show>
                        </div>
                        <SidebarSettings />
                    </div>
                </div>
            </div>
        </div>
    )
};


export const Sidebarred: ParentComponent = (props) => {
    return (
        <div class="flex">
            <Sidebar />
            {props.children}
        </div>
    )
};
