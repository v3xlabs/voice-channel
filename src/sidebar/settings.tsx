import { BsBoxArrowRight, BsGear, BsMusicNote } from "solid-icons/bs";
import { useAuth } from "../auth/provider";
import { createMemo, createSignal, createUniqueId, For, Show } from "solid-js";
import { normalizeProps, useMachine } from "@zag-js/solid";
import * as menu from '@zag-js/menu';
import { SettingsMenu } from "../components/settings";

export const SidebarSettings = () => {
    const { logout } = useAuth();
    const [isSettingsOpen, setIsSettingsOpen] = createSignal(false);

    const service = useMachine(menu.machine, {
        id: createUniqueId(),
        positioning: {
            placement: 'top-start'
        },
        onSelect: (e) => {
            if (e.value == 'logout') {
                logout();
            }
            if (e.value == 'settings') {
                setIsSettingsOpen(true);
            }
        }
    })
    const api = createMemo(() => menu.connect(service, normalizeProps));


    return (
        <div class="">
            <button class="button button-tertiary aspect-square w-10 flex items-center justify-center"
                title="Settings"
                {...api().getTriggerProps()}
            >
                <BsGear />
            </button>
            <div {...api().getPositionerProps()}>
                <ul class="bg-neutral-800 border border-neutral-700 p-0.5 w-screen max-w-38 rounded-lg data-[focus]:outline-none focus:outline-none" {...api().getContentProps()}>
                    <For each={[
                        ['settings', <BsGear />, 'Settings'],
                        ['audio', <BsMusicNote />, 'Audio'],
                        ['logout', <BsBoxArrowRight />, 'Logout'],
                    ] as const}>
                        {([value, icon, label]) => (
                            <li {...api().getItemProps({ value, closeOnSelect: true })} class="menu-item">
                                {icon}
                                {label}
                            </li>
                        )}
                    </For>
                </ul>
            </div>

            <Show when={isSettingsOpen()}>
                <SettingsMenu />
            </Show>
        </div>
    )
};
