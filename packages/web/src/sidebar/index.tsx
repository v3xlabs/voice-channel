import { createResource, For, ParentComponent, Show, Suspense } from "solid-js";
import { ServerGroup } from "./server";
import { SidebarSettings } from "./settings";
import { useParams } from "@solidjs/router";
import { useAuth } from "../auth/provider";
import { SidebarActivity } from "./activity";
import { BsHash } from "solid-icons/bs";
import { ServerChannels } from "./channels";

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
                <a href="/">Home</a>
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
                    <div class="p-2 rounded-lg bg-neutral-700 w-full z-50 flex justify-end relative">
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
