import { BsBoxArrowRight, BsGear, BsMusicNote, BsShieldLock } from "solid-icons/bs";
import { useAuth } from "../auth/provider";
import { createMemo, createSignal, createUniqueId, For } from "solid-js";
import { normalizeProps, useMachine } from "@zag-js/solid";
import * as menu from '@zag-js/menu';
import { SettingsMenu } from "../components/settings";
import { useNavigate } from "@solidjs/router";
import { useGuilds } from "../guilds/provider";

export const SidebarSettings = () => {
    const { logout } = useAuth();
    const navigate = useNavigate();
    const { isInstanceAdmin } = useGuilds();
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
            if (e.value == 'admin') {
                navigate('/admin');
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
                        ['settings', <BsGear />, 'Settings'] as const,
                        ['audio', <BsMusicNote />, 'Audio'] as const,
                        ...(isInstanceAdmin() ? [['admin', <BsShieldLock />, 'Admin'] as const] : []),
                        ['logout', <BsBoxArrowRight />, 'Logout'] as const,
                    ]}>
                        {([value, icon, label]) => (
                            <li {...api().getItemProps({ value, closeOnSelect: true })} class="menu-item">
                                {icon}
                                {label}
                            </li>
                        )}
                    </For>
                </ul>
            </div>

            <SettingsMenu open={isSettingsOpen()} onOpenChange={setIsSettingsOpen} />
        </div>
    )
};
