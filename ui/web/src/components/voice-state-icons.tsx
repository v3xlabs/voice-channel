import { Component, Show } from "solid-js";
import { BsCameraVideoFill, BsDisplay, BsMicMuteFill, BsVolumeMuteFill } from "solid-icons/bs";
import type { VoiceState } from "../xmpp/voice";

/** Muted, deafened, camera, and screen share as icons, in that order, only when on. */
export const VoiceStateIcons: Component<{ state?: VoiceState; joining?: boolean; class?: string }> = (props) => (
    <span class={`inline-flex items-center gap-1 ${props.class ?? ''}`}>
        <Show when={props.joining}><span class="text-[10px] text-neutral-500">joining</span></Show>
        <Show when={props.state?.muted}><BsMicMuteFill class="text-red-400" title="Muted" /></Show>
        <Show when={props.state?.deafened}><BsVolumeMuteFill class="text-red-400" title="Deafened" /></Show>
        <Show when={props.state?.camera}><BsCameraVideoFill class="text-emerald-300" title="Camera on" /></Show>
        <Show when={props.state?.screen}><BsDisplay class="text-emerald-300" title="Sharing a screen" /></Show>
    </span>
);
