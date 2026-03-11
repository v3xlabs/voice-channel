import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
// import type { AudioDevice, VideoDevice } from "@tauri-apps/plugin-media";

export const useAudioDevices = () => {
    const [devices, setDevices] = createSignal<MediaDeviceInfo[]>([]);
    const [media, setMedia] = createSignal<MediaStream | null>(null);
    // const [audioDevices, setAudioDevices] = createSignal<AudioDevice[]>([]);
    // const [videoDevices, setVideoDevices] = createSignal<VideoDevice[]>([]);

    const updateDevices = async () => {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setDevices(devices);
        // const media = await navigator.mediaDevices.getDisplayMedia({ video: true });
        // console.log(media);
        // const media = await navigator.mediaDevices.getUserMedia({ video: true });
        // console.log(media);
        // setMedia(media);
        for (const device of devices) {
            if (device.kind === 'videoinput') {
                // const media = await navigator.mediaDevices.getUserMedia({ video: { deviceId: device.deviceId } });
                console.log(device);
                console.log(location.href, location.origin, window.isSecureContext)
                // setMedia(media);
            }
        }
    };

    onMount(() => {
        navigator.mediaDevices.addEventListener('devicechange', updateDevices);
        updateDevices();
    });

    onCleanup(() => {
        navigator.mediaDevices.removeEventListener('devicechange', updateDevices);
    });

    return {
        devices,
        media,
    };
};