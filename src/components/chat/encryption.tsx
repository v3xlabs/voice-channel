import { Component, Show } from "solid-js";
import { useAuth } from "../../auth/provider";
import { BsExclamationTriangle, BsShieldLock } from "solid-icons/bs";

export const ChatEncryptionBadge: Component<{ jid: string }> = (props) => {
    const { encryption } = useAuth();
    const mode = () => encryption.getChatEncryption(props.jid);
    const enabled = () => mode().enabled && mode().mechanism !== "none";

    if (!enabled()) return null;

    return (
        <span class="text-xs flex items-center gap-1 text-green-400" title={`${mode().mechanism.toUpperCase()} enabled`}>
            <BsShieldLock />
            {mode().mechanism.toUpperCase()}
        </span>
    );
};

export const ChatTrustBadge: Component<{ jid: string }> = (props) => {
    const { encryption } = useAuth();
    const trusted = () => encryption.isContactTrusted(props.jid);

    return (
        <Show when={!trusted()}>
            <span class="text-xs flex items-center gap-1 text-yellow-500" title="This contact has no trusted keys">
                <BsExclamationTriangle />
                Untrusted
            </span>
        </Show>
    );
};
