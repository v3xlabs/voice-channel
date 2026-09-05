import { Component, Show } from "solid-js";
import type { CommandOutcome } from "../xmpp/commands";

export const describe = (outcome: CommandOutcome) => (outcome.ok ? outcome.note : outcome.error);

export const Outcome: Component<{ outcome?: CommandOutcome }> = (props) => (
    <Show when={props.outcome}>
        {(outcome) => (
            <p classList={{ 'text-sm': true, 'text-emerald-300': outcome().ok, 'text-red-300': !outcome().ok }}>
                {describe(outcome())}
            </p>
        )}
    </Show>
);
