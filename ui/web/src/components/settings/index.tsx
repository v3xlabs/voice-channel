import { Component, createSignal, For, Show } from "solid-js";
import { Dialog } from "@kobalte/core/dialog";
import { SettingsGeneral } from "./general";
import { SettingsAccount } from "./account";
import { SettingsAV } from "./av";
import { SettingsEncryption } from "./encryption";

export type SettingsSection = 'my-account' | 'profiles' | 'voice-video' | 'encryption';

const SECTIONS: { value: SettingsSection; label: string }[] = [
    { value: 'my-account', label: 'My Account' },
    { value: 'profiles', label: 'Profiles' },
    { value: 'voice-video', label: 'Voice & Video' },
    { value: 'encryption', label: 'Encryption' },
];

export type SettingsMenuProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export const SettingsMenu: Component<SettingsMenuProps> = (props) => {
    const [activeSection, setActiveSection] = createSignal<SettingsSection>('my-account');

    return (
        <Dialog open={props.open} onOpenChange={props.onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay class="fixed inset-0 z-[200] bg-black/60" />
                <div class="fixed inset-0 z-[200] flex items-center justify-center p-4 pointer-events-none">
                    <Dialog.Content class="pointer-events-auto w-full max-w-3xl xl:max-w-5xl rounded-lg border border-neutral-700 bg-neutral-900 overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
                        <div class="border-b border-neutral-700 px-4 py-3 flex items-center justify-between">
                            <Dialog.Title class="text-lg font-medium">Settings</Dialog.Title>
                            <Dialog.CloseButton class="text-neutral-400 hover:text-white">
                                <span class="sr-only">Close</span>
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                                </svg>
                            </Dialog.CloseButton>
                        </div>
                        <div class="grid grid-cols-[200px_1fr] min-h-[420px] flex-1 overflow-hidden">
                            <div class="border-r border-neutral-700 p-2 bg-neutral-850 overflow-y-auto">
                                <For each={SECTIONS}>
                                    {({ label, value }) => (
                                        <button
                                            class="w-full text-left px-3 py-2 rounded-md text-sm mt-1 transition-colors"
                                            classList={{
                                                "bg-neutral-700 text-white": activeSection() === value,
                                                "text-neutral-300 hover:bg-neutral-800": activeSection() !== value,
                                            }}
                                            onClick={() => setActiveSection(value)}
                                        >
                                            {label}
                                        </button>
                                    )}
                                </For>
                            </div>

                            <div class="p-4 space-y-4 overflow-y-auto">
                                <Show when={activeSection() === 'my-account'}>
                                    <SettingsAccount />
                                </Show>

                                <Show when={activeSection() === 'profiles'}>
                                    <SettingsGeneral />
                                </Show>

                                <Show when={activeSection() === 'voice-video'}>
                                    <SettingsAV />
                                </Show>

                                <Show when={activeSection() === 'encryption'}>
                                    <SettingsEncryption />
                                </Show>
                            </div>
                        </div>
                    </Dialog.Content>
                </div>
            </Dialog.Portal>
        </Dialog>
    );
};
