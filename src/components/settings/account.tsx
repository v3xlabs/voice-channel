import { Component, createSignal, For, Show } from "solid-js";
import { useAuth } from "../../auth/provider";
import { Jid } from "../jid";

export const SettingsAccount: Component = () => {
    const { logout, resource, setResource, jid, omemo, presence, setPresence } = useAuth();
    const [activeSection, setActiveSection] = createSignal<'general' | 'account'>('account');
    const saveSettings = () => {
        const nextResource = resourceInput().trim();
        if (!nextResource) return;
        setResource(nextResource);
        setPresence({
            show: showInput(),
            status: statusInput(),
        });
        // setIsSettingsOpen(false);
    };
    const [resourceInput, setResourceInput] = createSignal(resource());
    const [showInput, setShowInput] = createSignal(presence().show);
    const [statusInput, setStatusInput] = createSignal(presence().status);
    const [omemoDeviceInput, setOmemoDeviceInput] = createSignal('');
    const addOmemoDevice = async () => {
        const parsed = Number.parseInt(omemoDeviceInput().trim(), 10);
        if (!Number.isFinite(parsed) || parsed <= 0) return;
        await omemo.publishDeviceList([...omemo.deviceIds(), parsed]);
        setOmemoDeviceInput('');
    };

    const removeOmemoDevice = async (id: number) => {
        await omemo.publishDeviceList(omemo.deviceIds().filter((current) => current !== id));
    };

    const updatePresenceShow = (value: string) => {
        if (value === 'online' || value === 'chat' || value === 'away' || value === 'xa' || value === 'dnd') {
            setShowInput(value);
        }
    };
    return (
        <>
            <div class="space-y-1">
                <label class="text-sm text-neutral-300">Signed in as</label>
                <div class="w-full rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm min-h-10 flex items-center">
                    <Show when={jid()} fallback={<span class="text-neutral-400">Not signed in</span>}>
                        <Jid jid={jid() || ''} localClass="text-white" domainClass="font-medium" />
                    </Show>
                </div>
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

            <div class="space-y-1">
                <label class="text-sm text-neutral-300" for="xmpp-show">Presence</label>
                <select
                    id="xmpp-show"
                    value={showInput()}
                    onChange={(e) => updatePresenceShow(e.currentTarget.value)}
                    class="w-full rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm"
                >
                    <option value="online">Online</option>
                    <option value="chat">Available</option>
                    <option value="away">Away</option>
                    <option value="xa">Extended Away</option>
                    <option value="dnd">Do Not Disturb</option>
                </select>
            </div>

            <div class="space-y-1">
                <label class="text-sm text-neutral-300" for="xmpp-status">Status Text</label>
                <input
                    id="xmpp-status"
                    type="text"
                    value={statusInput()}
                    onInput={(e) => setStatusInput(e.currentTarget.value)}
                    class="w-full rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm"
                    placeholder="Optional status"
                />
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
        </>
    )
};
