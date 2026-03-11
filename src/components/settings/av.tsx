import { Component, createEffect, For, Show } from "solid-js";
import { useAudioDevices } from "../../utils/audio";

export const SettingsAV: Component = () => {
    const { devices, media } = useAudioDevices();
    let videoRef: HTMLVideoElement | undefined;

    createEffect(() => {
        if (videoRef && media()) {
            videoRef.srcObject = media()!;
        }
    });

    return (
        <div>
            <h3 class="text-sm font-medium mb-1">Audio/Video</h3>
            <p class="text-sm text-neutral-400">hello world</p>
            <div class="border rounded-sm">
                <For each={devices()}>
                    {(device) => (
                        <div>
                            {device.kind}
                            <div>
                                {JSON.stringify(device)}
                            </div>
                        </div>
                    )}
                </For>
            </div>
            <div>
                <Show when={media()}>
                    <div class="w-full h-full aspect-video border p-2">
                    <video ref={videoRef} autoplay playsinline class="w-full h-full object-cover" />
                    </div>
                </Show>
            </div>
        </div>
    )
};