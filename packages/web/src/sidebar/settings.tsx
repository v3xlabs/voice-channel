import { BsGear } from "solid-icons/bs";
import { useAuth } from "../auth/provider";
import { createMemo, createSignal, createUniqueId } from "solid-js";
import { normalizeProps, useMachine } from "@zag-js/solid";
import * as menu from '@zag-js/menu';

export const SidebarSettings = () => {
    const { logout } = useAuth();
    const service = useMachine(menu.machine, { id: createUniqueId(),
        positioning: {
            // fitViewport: true,
            // gutter: 8,
            placement: 'top'
        },
        // open: true,
        onSelect: (e) => {
            console.log(e);
            if (e.value == 'logout') {
                console.log('logging out');
                logout();
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
            <div
                // popover
                // role="menu"
                // id="sidebar-settings-popover"
                // aria-labelledby="sidebar-settings-button"
                {...api().getPositionerProps()}
            >
                <ul class="bg-neutral-800 border border-neutral-700 p-0.5 rounded-lg data-[focus]:outline-none focus:outline-none" {...api().getContentProps()}>
                    <li {...api().getItemProps({ value: 'settings', closeOnSelect: true })} class="menu-item">Settings</li>
                    <li {...api().getItemProps({ value: 'audio', closeOnSelect: true })} class="menu-item">Audio</li>
                    <li {...api().getItemProps({ value: 'logout', closeOnSelect: true })} class="menu-item">Logout</li>
                </ul>
            </div>
        </div>
    )
};
