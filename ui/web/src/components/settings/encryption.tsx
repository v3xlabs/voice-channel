import { Component, createMemo, createSignal, For, onMount, Show } from "solid-js";
import { useAuth } from "../../auth/provider";
import { Jid } from "../jid";
import { TrustIconButton } from "../encryption/trust-icon-button";
import { toBareJid } from "../../encryption/storage";
import {
    BsArrowClockwise,
    BsCloudCheck,
    BsCloudSlash,
    BsExclamationTriangle,
    BsKey,
    BsShield,
} from "solid-icons/bs";
import { fingerprintDisplay, formatTimestamp } from "./format";

export const SettingsEncryption: Component = () => {
    const { omemo, encryption, contacts, jid } = useAuth();
    const [publishStatus, setPublishStatus] = createSignal<"idle" | "publishing" | "published" | "error">("idle");
    const [isRefreshingDevices, setIsRefreshingDevices] = createSignal(false);
    const [bundleVersion, setBundleVersion] = createSignal(0);

    const manager = () => omemo.manager();
    const ownFingerprint = () => manager()?.getIdentityKeyFingerprint() || "";
    const ownDeviceId = () => manager()?.getDeviceId();
    const ownRegistrationId = () => manager()?.getRegistrationId();
    const isPublished = () => omemo.deviceIds().length > 0;
    const accountJid = () => jid();

    const contactName = (contactJid: string) => contacts().find((contact) => contact.jid === contactJid)?.name;
    const contactTrustEntries = createMemo(() => encryption.contactTrust());

    onMount(() => {
        const m = manager();
        const account = accountJid();
        if (!m || !account) return;
        void m.ensureContactKeyStore(toBareJid(account), false).finally(() => {
            setBundleVersion((value) => value + 1);
        });
    });

    const refreshOwnDevices = async () => {
        setIsRefreshingDevices(true);
        try {
            await omemo.refreshDeviceList();
            const m = manager();
            const account = accountJid();
            if (m && account) {
                await m.ensureContactKeyStore(toBareJid(account), true);
            }
            setBundleVersion((value) => value + 1);
        } finally {
            setIsRefreshingDevices(false);
        }
    };

    const publishOwnDeviceList = async () => {
        setPublishStatus("publishing");
        try {
            await omemo.republish();
            setPublishStatus("published");
            setTimeout(() => setPublishStatus("idle"), 3000);
        } catch {
            setPublishStatus("error");
            setTimeout(() => setPublishStatus("idle"), 3000);
        }
    };

    const regenerate = async () => {
        if (
            confirm(
                "This will delete your current OMEMO identity and create a new one. Other users will need to re-trust you. Continue?"
            )
        ) {
            await omemo.regenerateIdentity();
        }
    };

    const ownDeviceEntries = createMemo(() => {
        bundleVersion();
        const m = manager();
        const published = omemo.deviceIds();
        const currentId = ownDeviceId();
        const account = accountJid();
        if (!m || !account) return [];

        const ids = new Set<number>(published);
        if (currentId) ids.add(currentId);

        return Array.from(ids)
            .sort((a, b) => a - b)
            .map((deviceId) => {
                const isCurrent = deviceId === currentId;
                const bundle = m.getCachedBundle(toBareJid(account), deviceId);
                return {
                    deviceId,
                    isCurrent,
                    isPublished: published.includes(deviceId),
                    fingerprint: m.getOwnDeviceFingerprint(deviceId),
                    hasBundle: Boolean(bundle) || isCurrent,
                };
            });
    });

    return (
        <div class="space-y-6">
            <section class="rounded-md border border-neutral-700 p-4 space-y-3">
                <div class="flex items-center gap-2">
                    <BsShield class="text-cyan-400" />
                    <h3 class="text-sm font-medium">Your OMEMO Identity</h3>
                </div>

                <Show
                    when={ownDeviceId()}
                    fallback={
                        <div class="space-y-2">
                            <p class="text-xs text-neutral-500">No OMEMO identity generated yet.</p>
                            <button class="button button-primary text-xs" onClick={regenerate}>
                                Generate Identity
                            </button>
                        </div>
                    }
                >
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div class="space-y-1">
                            <label class="text-xs text-neutral-400">Device ID</label>
                            <div class="text-sm font-mono bg-neutral-800 rounded px-3 py-2 border border-neutral-700">
                                {ownDeviceId()}
                            </div>
                        </div>
                        <div class="space-y-1">
                            <label class="text-xs text-neutral-400">Registration ID</label>
                            <div class="text-sm font-mono bg-neutral-800 rounded px-3 py-2 border border-neutral-700">
                                {ownRegistrationId()}
                            </div>
                        </div>
                    </div>

                    <div class="space-y-1">
                        <label class="text-xs text-neutral-400">Identity Key Fingerprint</label>
                        <div class="text-xs font-mono break-all bg-neutral-800 rounded px-3 py-2 border border-neutral-700 flex items-start gap-2">
                            <BsKey class="shrink-0 mt-0.5" />
                            {fingerprintDisplay(ownFingerprint())}
                        </div>
                    </div>

                    <div class="flex items-center gap-2 text-xs">
                        <Show
                            when={omemo.canUse()}
                            fallback={
                                <span class="text-neutral-500 flex items-center gap-1">
                                    <BsCloudSlash />
                                    Server publication not available
                                </span>
                            }
                        >
                            <Show
                                when={isPublished()}
                                fallback={
                                    <span class="text-yellow-500 flex items-center gap-1">
                                        <BsExclamationTriangle />
                                        Not published to server
                                    </span>
                                }
                            >
                                <span class="text-green-500 flex items-center gap-1">
                                    <BsCloudCheck />
                                    Published ({omemo.deviceIds().length} device
                                    {omemo.deviceIds().length !== 1 ? "s" : ""})
                                </span>
                            </Show>
                        </Show>
                    </div>

                    <div class="flex flex-wrap gap-2">
                        <button
                            class="button button-secondary text-xs"
                            onClick={publishOwnDeviceList}
                            disabled={publishStatus() === "publishing"}
                        >
                            {publishStatus() === "publishing"
                                ? "Publishing..."
                                : isPublished()
                                  ? "Republish"
                                  : "Publish to server"}
                        </button>
                        <button class="button button-tertiary text-xs" onClick={() => void omemo.refreshDeviceList()}>
                            <BsArrowClockwise class="inline mr-1" />
                            Refresh published list
                        </button>
                        <button class="button button-tertiary text-xs text-red-400" onClick={regenerate}>
                            Regenerate identity
                        </button>
                    </div>
                </Show>
            </section>

            <section class="rounded-md border border-neutral-700 p-4 space-y-3">
                <div class="flex items-center justify-between gap-2">
                    <div>
                        <h3 class="text-sm font-medium">Your Devices</h3>
                        <p class="text-xs text-neutral-400 mt-1">
                            Other clients encrypt to these device IDs. Your other sessions auto-trust.
                        </p>
                    </div>
                    <button
                        class="button button-tertiary text-xs shrink-0"
                        onClick={refreshOwnDevices}
                        disabled={isRefreshingDevices()}
                    >
                        <BsArrowClockwise class="inline mr-1" />
                        {isRefreshingDevices() ? "Refreshing..." : "Refresh"}
                    </button>
                </div>

                <Show
                    when={ownDeviceEntries().length > 0}
                    fallback={<p class="text-xs text-neutral-500">No devices published yet.</p>}
                >
                    <ul class="space-y-2">
                        <For each={ownDeviceEntries()}>
                            {(device) => (
                                <li class="rounded-md border border-neutral-700 bg-neutral-900/40 p-3">
                                    <div class="flex items-center justify-between gap-2">
                                        <div>
                                            <span class="text-sm font-mono">Device {device.deviceId}</span>
                                            <Show when={device.isCurrent}>
                                                <span class="ml-2 text-[10px] uppercase text-cyan-300">This device</span>
                                            </Show>
                                        </div>
                                        <Show when={!device.isPublished && !device.isCurrent}>
                                            <span class="text-[10px] uppercase text-yellow-400">Unpublished</span>
                                        </Show>
                                    </div>
                                    <p class="text-[11px] font-mono break-all text-neutral-400 mt-2">
                                        {fingerprintDisplay(device.fingerprint)}
                                    </p>
                                </li>
                            )}
                        </For>
                    </ul>
                </Show>
            </section>

            <section class="rounded-md border border-neutral-700 p-4 space-y-3">
                <div class="flex items-center gap-2">
                    <BsShield class="text-cyan-400" />
                    <h3 class="text-sm font-medium">Contact Keys</h3>
                </div>
                <p class="text-xs text-neutral-400">
                    Click the icon to cycle trust: untrusted devices are skipped when sending OMEMO.
                </p>

                <Show
                    when={contactTrustEntries().length > 0}
                    fallback={
                        <p class="text-xs text-neutral-500">
                            No contact keys yet. Open a chat, use Encryption, and refresh devices.
                        </p>
                    }
                >
                    <div class="space-y-3">
                        <For each={contactTrustEntries()}>
                            {(contact) => (
                                <article class="rounded-md border border-neutral-700 bg-neutral-900/40 overflow-hidden">
                                    <div class="px-3 py-2 border-b border-neutral-700 bg-neutral-800/50">
                                        <div class="flex items-center gap-2">
                                            <Jid jid={contact.jid} class="text-sm" />
                                            <Show when={contactName(contact.jid)}>
                                                <span class="text-xs text-neutral-400">({contactName(contact.jid)})</span>
                                            </Show>
                                        </div>
                                    </div>

                                    <ul class="divide-y divide-neutral-800">
                                        <For each={contact.devices}>
                                            {(device) => (
                                                <li class="p-3 flex items-start justify-between gap-3">
                                                    <div class="min-w-0 space-y-1">
                                                        <span class="text-sm font-mono">Device {device.deviceId}</span>
                                                        <div class="text-[11px] font-mono break-all text-neutral-400">
                                                            {fingerprintDisplay(device.fingerprint)}
                                                        </div>
                                                        <div class="text-[11px] text-neutral-500">
                                                            Last seen {formatTimestamp(device.lastSeenAt)}
                                                        </div>
                                                    </div>
                                                    <TrustIconButton
                                                        level={device.level}
                                                        onCycle={() =>
                                                            encryption.cycleDeviceTrust(contact.jid, device.deviceId)
                                                        }
                                                        size="sm"
                                                    />
                                                </li>
                                            )}
                                        </For>
                                    </ul>
                                </article>
                            )}
                        </For>
                    </div>
                </Show>
            </section>
        </div>
    );
};
