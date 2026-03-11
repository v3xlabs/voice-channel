import { Component, createSignal, For, Show } from "solid-js";
import { SettingsGeneral } from "./general";
import { SettingsAccount } from "./account";
import { SettingsAV } from "./av";

export type SettingsSection = 'general' | 'account' | 'av';

export const SettingsMenu: Component = () => {
    const [activeSection, setActiveSection] = createSignal<SettingsSection>('general');

    return (
        <div class="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
            <div class="w-full max-w-3xl xl:max-w-5xl rounded-lg border border-neutral-700 bg-neutral-900 overflow-hidden">
                <div class="border-b border-neutral-700 px-4 py-3">
                    <h2 class="text-lg font-medium">Settings</h2>
                </div>
                <div class="grid grid-cols-[180px_1fr] min-h-[420px]">
                    <div class="border-r border-neutral-700 p-2 bg-neutral-850">
                        <For each={[
                            { label: 'General', value: 'general' },
                            { label: 'Media', value: 'av' },
                            { label: 'Account', value: 'account' },
                        ] as const}>
                            {({ label, value }) => (
                                <button
                                    class="w-full text-left px-3 py-2 rounded-md text-sm mt-1"
                                    classList={{ "bg-neutral-700 text-white": activeSection() === value, "text-neutral-300 hover:bg-neutral-800": activeSection() !== value }}
                                    onClick={() => setActiveSection(value)}
                                >
                                    {label}
                                </button>
                            )}
                        </For>
                    </div>

                    <div class="p-4 space-y-4">
                        <Show when={activeSection() === 'general'}>
                            <SettingsGeneral />
                        </Show>

                        <Show when={activeSection() === 'av'}>
                            <SettingsAV />
                        </Show>

                        <Show when={activeSection() === 'account'}>
                            <SettingsAccount />
                        </Show>

                    </div>
                </div>

                <div class="border-t border-neutral-700 p-3 flex justify-end gap-2">
                    <button class="button button-tertiary" onClick={() => { }}>Cancel</button>
                    <button class="button" onClick={() => { }}>Save</button>
                </div>
            </div>
        </div>
    )
};