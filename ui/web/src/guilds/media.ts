import { createStore, produce, reconcile } from 'solid-js/store';
import type { Agent } from 'stanza';
import type { MediaSession } from 'stanza/jingle';

const DEVICES_KEY = '@vc/media-devices';
const OUTPUT_KEY = '@vc/media-output';
const LEVEL_INTERVAL_MS = 100;
const SPEAKING_LEVEL = 0.02;

/** Screen share sessions carry this sid prefix so the conference service labels them apart. */
const SCREEN_SID_PREFIX = 'screen-';

/**
 * A device id stored from an earlier session goes stale as soon as the hardware changes, and an
 * `exact` constraint then rejects instead of picking another device. Falling back keeps a stale
 * choice from stranding the call: without a published stream the conference service never opens
 * the participant's connection, so they would not receive anyone else either.
 */
const openStream = async (
    constraints: MediaStreamConstraints,
    fallback: MediaStreamConstraints,
): Promise<MediaStream> =>
    navigator.mediaDevices
        .getUserMedia(constraints)
        .catch(() => navigator.mediaDevices.getUserMedia(fallback));

/**
 * The instance's STUN and TURN services (XEP-0215) as ICE servers.
 *
 * stanza's own `discoverICEServers` cannot be used: it resolves to an empty array and only
 * populates `jingle.iceServers` as a side effect, and it appends `?transport=` to every URI,
 * which RFC 7064 does not allow on a `stun:` one. RTCPeerConnection then refuses to construct.
 */
const discoverIceServers = async (client: Agent): Promise<RTCIceServer[]> => {
    const domain = client.config.server;
    if (!domain) return [];
    const response = await client.getServices(domain, undefined, '2').catch(() => undefined);
    return (response?.services ?? []).flatMap((service): RTCIceServer[] => {
        if (!service.host) return [];
        const host = service.host.includes(':') ? `[${service.host}]` : service.host;
        const uri = `${service.type}:${host}${service.port ? `:${service.port}` : ''}`;
        switch (service.type) {
            case 'stun':
            case 'stuns':
                return [{ urls: uri }];
            case 'turn':
            case 'turns':
                return [{
                    urls: service.transport ? `${uri}?transport=${service.transport}` : uri,
                    username: service.username,
                    credential: service.password,
                }];
            default:
                return [];
        }
    });
};

export type DeviceChoice = {
    mic?: string;
    camera?: string;
    speaker?: string;
};

export type DeviceList = {
    mics: MediaDeviceInfo[];
    cameras: MediaDeviceInfo[];
    speakers: MediaDeviceInfo[];
};

export type RemoteStream = {
    sid: string;
    /** Bare JID of the participant who sends this stream, from the session id the service assigns. */
    owner?: string;
    stream: MediaStream;
    hasVideo: boolean;
};

export type MediaState = {
    devices: DeviceList;
    chosen: DeviceChoice;
    /** 0 to 1 output gain applied to every remote stream. */
    outputVolume: number;
    /** Microphone level, 0 to 1. */
    localLevel: number;
    /** Level per remote stream sid, 0 to 1. */
    remoteLevels: Record<string, number>;
    remote: Record<string, RemoteStream>;
    cameraStream?: MediaStream;
    screenStream?: MediaStream;
    /** The label of the shared surface, as the browser names it. */
    screenLabel?: string;
    micLabel?: string;
};

const parse = <T,>(value: string | null, fallback: T): T => {
    if (!value) return fallback;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
};

/** Bare JID the conference service encodes into the session id of a stream it sends us. */
export const ownerFromSid = (sid: string): string | undefined => {
    const index = sid.indexOf('~');
    return index >= 0 ? sid.slice(index + 1) : undefined;
};

const levelOf = (analyser: AnalyserNode, buffer: Float32Array): number => {
    analyser.getFloatTimeDomainData(buffer);
    let sum = 0;
    for (const sample of buffer) sum += sample * sample;
    return Math.min(1, Math.sqrt(sum / buffer.length) * 4);
};

export const isSpeaking = (level: number) => level > SPEAKING_LEVEL;

/**
 * Local devices, published sessions, remote streams, and levels for the active call.
 * Presence and admission stay in the guild provider; this owns everything WebRTC.
 */
export const createMediaController = (client: () => Agent | undefined) => {
    const [state, setState] = createStore<MediaState>({
        devices: { mics: [], cameras: [], speakers: [] },
        chosen: parse<DeviceChoice>(localStorage.getItem(DEVICES_KEY), {}),
        outputVolume: parse<number>(localStorage.getItem(OUTPUT_KEY), 1),
        localLevel: 0,
        remoteLevels: {},
        remote: {},
    });

    let audioContext: AudioContext | undefined;
    let micStream: MediaStream | undefined;
    let micSession: MediaSession | undefined;
    let cameraSession: MediaSession | undefined;
    let screenSession: MediaSession | undefined;
    let conference: string | undefined;
    const analysers = new Map<string, { analyser: AnalyserNode; buffer: Float32Array }>();
    let levelTimer: number | undefined;

    const context = () => {
        audioContext ??= new AudioContext();
        return audioContext;
    };

    const watchLevel = (key: string, stream: MediaStream) => {
        if (stream.getAudioTracks().length === 0) return;
        const analyser = context().createAnalyser();
        analyser.fftSize = 512;
        context().createMediaStreamSource(stream).connect(analyser);
        analysers.set(key, { analyser, buffer: new Float32Array(analyser.fftSize) });
        levelTimer ??= window.setInterval(() => {
            for (const [id, entry] of analysers) {
                const level = levelOf(entry.analyser, entry.buffer);
                if (id === 'local') setState('localLevel', level);
                else setState('remoteLevels', id, level);
            }
        }, LEVEL_INTERVAL_MS);
    };

    const unwatchLevel = (key: string) => {
        analysers.get(key)?.analyser.disconnect();
        analysers.delete(key);
        if (analysers.size === 0 && levelTimer !== undefined) {
            window.clearInterval(levelTimer);
            levelTimer = undefined;
        }
    };

    const refreshDevices = async () => {
        const all = await navigator.mediaDevices.enumerateDevices();
        setState('devices', {
            mics: all.filter((d) => d.kind === 'audioinput'),
            cameras: all.filter((d) => d.kind === 'videoinput'),
            speakers: all.filter((d) => d.kind === 'audiooutput'),
        });
    };

    const choose = (patch: DeviceChoice) => {
        setState('chosen', (current) => ({ ...current, ...patch }));
        localStorage.setItem(DEVICES_KEY, JSON.stringify(state.chosen));
    };

    const setOutputVolume = (volume: number) => {
        setState('outputVolume', volume);
        localStorage.setItem(OUTPUT_KEY, JSON.stringify(volume));
    };

    const openMic = async () => {
        const stream = await openStream(
            { audio: state.chosen.mic ? { deviceId: { exact: state.chosen.mic } } : true },
            { audio: true },
        );
        setState('micLabel', stream.getAudioTracks()[0]?.label);
        return stream;
    };

    /** Publish the microphone: the participant's own session to the conference service. */
    const start = async (conferenceJid: string, muted: boolean) => {
        const c = client();
        if (!c) return;
        conference = conferenceJid;
        c.jingle.iceServers = await discoverIceServers(c);
        micStream = await openMic();
        for (const track of micStream.getAudioTracks()) track.enabled = !muted;
        watchLevel('local', micStream);
        micSession = c.jingle.createMediaSession(conferenceJid, undefined, micStream);
        await micSession.start();
        await refreshDevices();
    };

    const setMuted = (muted: boolean) => {
        for (const track of micStream?.getAudioTracks() ?? []) track.enabled = !muted;
    };

    /** Swap the microphone in place: the published sender keeps its session. */
    const switchMic = async (deviceId: string) => {
        choose({ mic: deviceId });
        if (!micSession || !micStream) return;
        const next = await openMic();
        const track = next.getAudioTracks()[0];
        const sender = micSession.pc.getSenders().find((s) => s.track?.kind === 'audio');
        if (track && sender) await sender.replaceTrack(track);
        for (const old of micStream.getTracks()) old.stop();
        unwatchLevel('local');
        micStream = next;
        watchLevel('local', next);
    };

    const setCamera = async (on: boolean) => {
        const c = client();
        if (!on) {
            cameraSession?.end('success', true);
            cameraSession = undefined;
            for (const track of state.cameraStream?.getTracks() ?? []) track.stop();
            setState('cameraStream', undefined);
            return;
        }
        if (!c || !conference) return;
        const stream = await openStream(
            { video: state.chosen.camera ? { deviceId: { exact: state.chosen.camera } } : true },
            { video: true },
        );
        setState('cameraStream', stream);
        cameraSession = c.jingle.createMediaSession(conference, undefined, stream);
        await cameraSession.start();
        await refreshDevices();
    };

    const switchCamera = async (deviceId: string) => {
        choose({ camera: deviceId });
        if (!state.cameraStream) return;
        await setCamera(false);
        await setCamera(true);
    };

    const setScreen = async (on: boolean) => {
        const c = client();
        if (!on) {
            screenSession?.end('success', true);
            screenSession = undefined;
            for (const track of state.screenStream?.getTracks() ?? []) track.stop();
            setState({ screenStream: undefined, screenLabel: undefined });
            return;
        }
        if (!c || !conference) return;
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const track = stream.getVideoTracks()[0];
        setState({ screenStream: stream, screenLabel: track?.label });
        track?.addEventListener('ended', () => void setScreen(false));
        screenSession = c.jingle.createMediaSession(conference, `${SCREEN_SID_PREFIX}${crypto.randomUUID()}`, stream);
        await screenSession.start();
    };

    const stop = () => {
        for (const session of [micSession, cameraSession, screenSession]) session?.end('success', true);
        micSession = cameraSession = screenSession = undefined;
        for (const stream of [micStream, state.cameraStream, state.screenStream]) {
            for (const track of stream?.getTracks() ?? []) track.stop();
        }
        micStream = undefined;
        conference = undefined;
        for (const key of [...analysers.keys()]) unwatchLevel(key);
        const c = client();
        for (const remote of Object.values(state.remote)) c?.jingle.sessions[remote.sid]?.end('success', true);
        setState({ cameraStream: undefined, screenStream: undefined, screenLabel: undefined, micLabel: undefined, localLevel: 0 });
        setState('remote', reconcile({}));
        setState('remoteLevels', reconcile({}));
    };

    const onRemoteTrack = (session: MediaSession, stream: MediaStream) => {
        setState('remote', session.sid, {
            sid: session.sid,
            owner: ownerFromSid(session.sid),
            stream,
            hasVideo: stream.getVideoTracks().length > 0,
        });
        if (!analysers.has(session.sid)) watchLevel(session.sid, stream);
    };

    const onRemoteEnded = (session: MediaSession) => {
        unwatchLevel(session.sid);
        setState('remote', produce((remote) => { delete remote[session.sid]; }));
        setState('remoteLevels', produce((levels) => { delete levels[session.sid]; }));
    };

    return {
        state,
        refreshDevices,
        choose,
        setOutputVolume,
        start,
        stop,
        setMuted,
        switchMic,
        setCamera,
        switchCamera,
        setScreen,
        onRemoteTrack,
        onRemoteEnded,
    };
};

export type MediaController = ReturnType<typeof createMediaController>;
