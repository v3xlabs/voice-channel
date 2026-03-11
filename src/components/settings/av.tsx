import { Component, createEffect, createSignal, For, Match, Show, Switch } from "solid-js";
import { useAudioDevices } from "../../utils/audio";
import { BsCameraVideo, BsMic } from "solid-icons/bs";

// dynamic indicator that shows how loud the person is speaking, this is mic input so we need to derive how loud the person is
const VolumeIndicator: Component<{ track: MediaStreamTrack }> = ({ track }) => {

    return <div>{volume()}</div>
}

export const SettingsAV: Component = () => {
    const {
        audioDevices,
        videoDevices,
        media,
        requestVideoStream,
        requestAudioStream,
        requestScreenStream,
        updateDevices,
        audioStream,
        videoStream
    } = useAudioDevices();
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
            <div class="grid gap-4 grid-cols-4">
                <button class="button button-primary" onClick={requestVideoStream}>Request Video Stream</button>
                <button class="button button-primary" onClick={requestAudioStream}>Request Audio Stream</button>
                <button class="button button-primary" onClick={requestScreenStream}>Request Screen Stream</button>
                <button class="button button-primary" onClick={updateDevices}>Update Devices</button>
            </div>
            <div class="grid grid-cols-2 gap-2">
                <div class="border rounded-sm max-h-[60vh] overflow-y-auto">
                    <For each={audioDevices()}>
                        {(device) => (
                            <div class="flex items-center justify-between gap-2 max-w-full">
                                <div class="flex items-center gap-2 grow">
                                    <BsMic />
                                    <div>
                                        <div>{device.label}</div>
                                        <div class="text-xs text-neutral-400 truncate overflow-clip text-ellipsis max-w-32">{device.groupId}</div>
                                    </div>
                                </div>
                                <div class="truncate overflow-clip text-ellipsis shrink">
                                </div>
                            </div>
                        )}
                    </For>
                </div>
                <div class="border rounded-sm max-h-[60vh] overflow-y-auto">
                    <For each={videoDevices()}>
                        {(device) => (
                            <div class="flex items-center justify-between gap-2 max-w-full">
                                <div class="flex items-center gap-2 grow">
                                    <BsCameraVideo />
                                    <div>
                                        <div>{device.label}</div>
                                    </div>
                                </div>
                                <div class="truncate overflow-clip text-ellipsis shrink">
                                    {device.groupId}
                                </div>
                            </div>
                        )}
                    </For>
                </div>
            </div>
            <div>
                <Show when={media()}>
                    <div class="w-full h-full aspect-video border p-2">
                        <video ref={(el) => {
                            el.srcObject = media()!;
                        }} autoplay playsinline class="w-full h-full object-cover" />
                    </div>
                </Show>
            </div>
        </div>
    )
};