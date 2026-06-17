import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { Component, createEffect, createSignal, For, Show } from "solid-js";
import { useAuth } from "../../auth/provider";
import { EncryptionMechanism } from "../../encryption/types";
import { TrustIconButton } from "../encryption/trust-icon-button";
import { BsArrowClockwise, BsShieldLock } from "solid-icons/bs";

type ChatEncryptionDropdownProps = {
    jid: string;
};

const MECHANISMS: { value: EncryptionMechanism; label: string; disabled?: boolean }[] = [
    { value: "none", label: "None" },
    { value: "omemo", label: "OMEMO" },
    { value: "pgp", label: "OpenPGP (soon)", disabled: true },
];

export const ChatEncryptionDropdown: Component<ChatEncryptionDropdownProps> = (props) => {
    const { encryption } = useAuth();
    const [isRefreshing, setIsRefreshing] = createSignal(false);
    const [isPrefetching, setIsPrefetching] = createSignal(false);

    const devices = () => encryption.getKnownContactDevices(props.jid);

    const mode = () => encryption.getChatEncryption(props.jid);
    const isEnabled = () => mode().enabled && mode().mechanism !== "none";

    const prefetchDevices = async () => {
        setIsPrefetching(true);
        try {
            await encryption.fetchContactDevices(props.jid);
        } finally {
            setIsPrefetching(false);
        }
    };

    const refreshDevices = async () => {
        setIsRefreshing(true);
        try {
            await encryption.refreshContactDevices(props.jid);
        } finally {
            setIsRefreshing(false);
        }
    };

    createEffect(() => {
        const jid = props.jid;
        if (!jid) return;
        void prefetchDevices();
    });

    const setMechanism = (value: EncryptionMechanism) => {
        encryption.setChatEncryptionMechanism(props.jid, value);
        if (value !== "none") {
            encryption.setChatEncryptionEnabled(props.jid, true);
        }
    };

    const isLoading = () => isRefreshing() || isPrefetching();

    return (
        <DropdownMenu>
            <DropdownMenu.Trigger
                class="text-xs text-neutral-300 hover:text-white flex items-center gap-1 rounded px-2 py-1 hover:bg-neutral-800"
                aria-label="Encryption settings"
            >
                <BsShieldLock class={isEnabled() ? "text-green-400" : "text-neutral-400"} />
                Encryption
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content class="context-menu__content w-72 max-h-[70vh] overflow-y-auto">
                    <DropdownMenu.Group>
                        <DropdownMenu.GroupLabel class="px-2 py-1 text-[11px] uppercase tracking-wide text-neutral-500">
                            Mode
                        </DropdownMenu.GroupLabel>
                        <DropdownMenu.RadioGroup
                            value={mode().mechanism}
                            onChange={(value) => setMechanism(value as EncryptionMechanism)}
                        >
                            <For each={MECHANISMS}>
                                {(item) => (
                                    <DropdownMenu.RadioItem
                                        value={item.value}
                                        class="context-menu__radio-item"
                                        disabled={item.disabled}
                                    >
                                        <DropdownMenu.ItemIndicator class="context-menu__item-indicator">
                                            •
                                        </DropdownMenu.ItemIndicator>
                                        {item.label}
                                    </DropdownMenu.RadioItem>
                                )}
                            </For>
                        </DropdownMenu.RadioGroup>
                    </DropdownMenu.Group>

                    <DropdownMenu.Separator class="context-menu__separator" />

                    <div class="px-2 py-1 flex items-center justify-between">
                        <span class="text-[11px] uppercase tracking-wide text-neutral-500 flex items-center gap-1">
                            Devices
                            <Show when={isPrefetching() && devices().length > 0}>
                                <BsArrowClockwise class="animate-spin text-neutral-500" size={12} />
                            </Show>
                        </span>
                        <button
                            type="button"
                            class="text-xs text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1"
                            disabled={isRefreshing()}
                            onClick={() => void refreshDevices()}
                        >
                            <BsArrowClockwise class={isRefreshing() ? "animate-spin" : ""} />
                            {isRefreshing() ? "Refreshing..." : "Refresh"}
                        </button>
                    </div>

                    <Show when={devices().length === 0 && !isLoading()}>
                        <p class="px-2 py-1 text-xs text-neutral-500">No devices known yet.</p>
                    </Show>

                    <Show when={devices().length === 0 && isPrefetching()}>
                        <p class="px-2 py-1 text-xs text-neutral-500">Discovering devices...</p>
                    </Show>

                    <For each={devices()}>
                        {(deviceId) => (
                            <div class="px-2 py-1.5 flex items-center justify-between gap-2 rounded-sm hover:bg-neutral-700/40">
                                <span class="text-xs font-mono truncate">Device {deviceId}</span>
                                <TrustIconButton
                                    level={encryption.getDeviceTrust(props.jid, deviceId)}
                                    onCycle={() => encryption.cycleDeviceTrust(props.jid, deviceId)}
                                    size="sm"
                                />
                            </div>
                        )}
                    </For>

                    <Show when={isEnabled() && devices().length > 0 && !encryption.isContactTrusted(props.jid)}>
                        <p class="px-2 pt-2 text-[11px] text-yellow-500">
                            Trust at least one device to send OMEMO messages.
                        </p>
                    </Show>
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu>
    );
};
