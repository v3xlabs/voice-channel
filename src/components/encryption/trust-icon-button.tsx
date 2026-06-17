import { Component, Show } from "solid-js";
import { TrustLevel } from "../../encryption/types";
import { BsCheckCircle, BsExclamationTriangle, BsShieldCheck } from "solid-icons/bs";
import { trustLevelLabel } from "../settings/format";

type TrustIconButtonProps = {
    level: TrustLevel;
    onCycle: () => void;
    disabled?: boolean;
    size?: "sm" | "md";
};

const iconClass = (level: TrustLevel, size: "sm" | "md") => {
    const base = size === "sm" ? "text-base" : "text-lg";
    switch (level) {
        case "verified":
            return `${base} text-cyan-400 hover:text-cyan-300`;
        case "trusted":
            return `${base} text-green-500 hover:text-green-400`;
        default:
            return `${base} text-yellow-500 hover:text-yellow-400`;
    }
};

export const TrustIconButton: Component<TrustIconButtonProps> = (props) => {
    const size = () => props.size || "md";

    return (
        <button
            type="button"
            class="inline-flex items-center gap-1 rounded p-1 hover:bg-neutral-700/60 transition-colors disabled:opacity-50"
            title={`${trustLevelLabel(props.level)} — click to change`}
            aria-label={`Trust level: ${trustLevelLabel(props.level)}`}
            disabled={props.disabled}
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                props.onCycle();
            }}
        >
            <Show when={props.level === "untrusted"}>
                <BsExclamationTriangle class={iconClass("untrusted", size())} />
            </Show>
            <Show when={props.level === "trusted"}>
                <BsCheckCircle class={iconClass("trusted", size())} />
            </Show>
            <Show when={props.level === "verified"}>
                <BsShieldCheck class={iconClass("verified", size())} />
            </Show>
        </button>
    );
};
