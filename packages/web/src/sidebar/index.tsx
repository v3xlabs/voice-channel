import { For } from "solid-js";
import { ServerGroup } from "./server";
import { useAuth } from "../auth/provider";

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
                    groupId: '2',
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
                    groupId: '3',
                    name: 'Jakob\'s Home',
                    icon: '🇸🇪',
                },
                {
                    groupId: '4',
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
                    groupId: '5',
                    name: 'General Lounge Server With Long Name That Doesn\'t End',
                    icon: '🏠',
                }
            ]
        }
    ];
    const { logout } = useAuth();

    return (
        <div class="h-screen flex relative">
            <div class="w-[72px] bg-neutral-900 h-full flex flex-col gap-2 items-center p-2">
                <For each={servers}>
                    {(server) => (
                        <ServerGroup server={server} />
                    )}
                </For>
            </div>
            <div class="w-64 bg-neutral-800 h-full flex">

            </div>
            <div class="absolute bottom-2 left-2 right-2 p-2 rounded-lg bg-neutral-600">
                <div></div>
                <button onClick={logout} class="button">Logout</button>
            </div>
        </div>
    )
};