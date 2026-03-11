import { createMemo, createSignal, onCleanup, onMount } from "solid-js";

export const useAudioDevices = () => {
    const [devices, setDevices] = createSignal<MediaDeviceInfo[]>([]);
    const [media, setMedia] = createSignal<MediaStream | null>(null);
    const [audioStream, setAudioStream] = createSignal<MediaStream | null>(null);
    const [videoStream, setVideoStream] = createSignal<MediaStream | null>(null);

    const requestVideoStream = async () => {
        const media = await navigator.mediaDevices.getUserMedia({ video: true });

        setMedia(media);
    };

    const requestAudioStream = async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setAudioStream(stream);
    };

    const requestScreenStream = async () => {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        setVideoStream(stream);
    };

    const updateDevices = async () => {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setDevices(devices);
    };

    onMount(() => {
        navigator.mediaDevices.addEventListener('devicechange', updateDevices);
        updateDevices();
    });

    onCleanup(() => {
        navigator.mediaDevices.removeEventListener('devicechange', updateDevices);
    });

    const audioDevices = createMemo(() => {
        return devices().filter((device) => device.kind === 'audioinput');
    });

    const videoDevices = createMemo(() => {
        return devices().filter((device) => device.kind === 'videoinput');
    });

    return {
        audioDevices,
        videoDevices,
        media,
        requestVideoStream,
        requestAudioStream,
        requestScreenStream,
        updateDevices,
        audioStream,
        videoStream,
    };
};
