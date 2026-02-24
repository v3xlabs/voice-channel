import { BsBoxArrowRight, BsGear, BsMusicNote } from "solid-icons/bs";
import { useAuth } from "../auth/provider";
import { createEffect, createMemo, createSignal, createUniqueId, For, Show } from "solid-js";
import { normalizeProps, useMachine } from "@zag-js/solid";
import * as menu from '@zag-js/menu';

export const SidebarSettings = () => {
    const { logout, resource, setResource, jid, omemo } = useAuth();
    const [isSettingsOpen, setIsSettingsOpen] = createSignal(false);
    const [resourceInput, setResourceInput] = createSignal(resource());
    const [omemoDeviceInput, setOmemoDeviceInput] = createSignal('');

    createEffect(() => {
        if (isSettingsOpen()) {
            setResourceInput(resource());
            omemo.refreshDeviceList();
        }
    });

    const addOmemoDevice = async () => {
        const parsed = Number.parseInt(omemoDeviceInput().trim(), 10);
        if (!Number.isFinite(parsed) || parsed <= 0) return;
        await omemo.publishDeviceList([...omemo.deviceIds(), parsed]);
        setOmemoDeviceInput('');
    };

    const removeOmemoDevice = async (id: number) => {
        await omemo.publishDeviceList(omemo.deviceIds().filter((current) => current !== id));
    };

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

    const saveSettings = () => {
        const nextResource = resourceInput().trim();
        if (!nextResource) return;
        setResource(nextResource);
        setIsSettingsOpen(false);
    };

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
                <div class="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
                    <div class="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-4 space-y-4">
                        <div>
                            <h2 class="text-lg font-medium">XMPP Settings</h2>
                            <p class="text-sm text-neutral-400">Configure your client resource and reconnect behavior.</p>
                        </div>

                        <div class="space-y-1">
                            <label class="text-sm text-neutral-300" for="xmpp-jid">Signed in as</label>
                            <input
                                id="xmpp-jid"
                                type="text"
                                value={jid() || ''}
                                disabled
                                class="w-full rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm text-neutral-400"
                            />
                        </div>

                        <div class="space-y-1">
                            <label class="text-sm text-neutral-300" for="xmpp-resource">Resource</label>
                            <input
                                id="xmpp-resource"
                                type="text"
                                value={resourceInput()}
                                onInput={(e) => setResourceInput(e.currentTarget.value)}
                                class="w-full rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm"
                                placeholder="voice-channel-web"
                            />
                            <p class="text-xs text-neutral-400">Changing the resource reconnects the XMPP session.</p>
                        </div>

                        <Show when={omemo.canUse()} fallback={<p class="text-xs text-neutral-500">OMEMO feature is not advertised by this server.</p>}>
                            <div class="space-y-2 rounded-md border border-neutral-700 p-3">
                                <label class="text-sm text-neutral-300 flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={omemo.isEnabled()}
                                        onChange={(e) => omemo.setEnabled(e.currentTarget.checked)}
                                    />
                                    Prefer OMEMO (EME marker groundwork)
                                </label>

                                <div class="flex items-center justify-between">
                                    <p class="text-xs text-neutral-400">Device list</p>
                                    <button class="text-xs text-cyan-400" onClick={omemo.refreshDeviceList}>Refresh</button>
                                </div>

                                <div class="flex gap-1">
                                    <input
                                        type="text"
                                        value={omemoDeviceInput()}
                                        onInput={(e) => setOmemoDeviceInput(e.currentTarget.value)}
                                        class="flex-1 rounded bg-neutral-800 border border-neutral-700 px-2 py-1 text-xs"
                                        placeholder="Add device id"
                                    />
                                    <button class="button button-tertiary !px-2 !py-1 text-xs" onClick={addOmemoDevice}>Add</button>
                                </div>

                                <div class="flex flex-wrap gap-1">
                                    <For each={omemo.deviceIds()}>
                                        {(id) => (
                                            <button class="text-xs px-2 py-1 rounded bg-neutral-800 border border-neutral-700" onClick={() => removeOmemoDevice(id)}>
                                                {id} x
                                            </button>
                                        )}
                                    </For>
                                </div>
                            </div>
                        </Show>

                        <div class="flex justify-end gap-2">
                            <button class="button button-tertiary" onClick={() => setIsSettingsOpen(false)}>Cancel</button>
                            <button class="button" onClick={saveSettings}>Save</button>
                        </div>
                    </div>
                </div>
            </Show>
        </div>
    )
};
