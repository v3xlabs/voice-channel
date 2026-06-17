import { Component, createSignal, Show } from "solid-js";
import { useAuth } from "../../auth/provider";
import { Jid } from "../jid";

export const SettingsAccount: Component = () => {
    const { resource, setResource, jid, presence, setPresence } = useAuth();
    const [resourceInput, setResourceInput] = createSignal(resource());
    const [showInput, setShowInput] = createSignal(presence().show);
    const [statusInput, setStatusInput] = createSignal(presence().status);

    const applyResource = () => {
        const nextResource = resourceInput().trim();
        if (nextResource) setResource(nextResource);
    };

    const applyPresence = () => {
        setPresence({
            show: showInput(),
            status: statusInput(),
        });
    };

    const updatePresenceShow = (value: string) => {
        if (value === 'online' || value === 'chat' || value === 'away' || value === 'xa' || value === 'dnd') {
            setShowInput(value);
            setPresence({
                show: value,
                status: statusInput(),
            });
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
                    onBlur={applyResource}
                    onKeyDown={(e) => { if (e.key === 'Enter') applyResource(); }}
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
                    onBlur={applyPresence}
                    onKeyDown={(e) => { if (e.key === 'Enter') applyPresence(); }}
                    class="w-full rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm"
                    placeholder="Optional status"
                />
            </div>
        </>
    )
};
