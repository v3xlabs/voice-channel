import { Component, createEffect, createMemo, createSignal, For, Show, type JSX } from "solid-js"
import { useParams } from "@solidjs/router";
import { BsCameraVideoFill, BsCameraVideoOffFill, BsChevronUp, BsDisplay, BsHash, BsHeadphones, BsMicFill, BsMicMuteFill, BsTelephoneXFill, BsVolumeMuteFill, BsVolumeUp } from "solid-icons/bs";
import { useGuilds, type Occupant } from "../../guilds/provider";
import { isSpeaking } from "../../guilds/media";
import { VoiceStateIcons } from "../../components/voice-state-icons";
import { Avatar } from "../../components/avatar";

const timeLabel = (timestamp: number) =>
    new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const Level: Component<{ level: number }> = (props) => (
    <div class="h-1.5 w-24 bg-neutral-800 rounded-sm overflow-hidden">
        <div class="h-full bg-emerald-400 transition-[width] duration-100" style={{ width: `${Math.round(props.level * 100)}%` }} />
    </div>
);

const DevicePicker: Component<{ label: string; devices: MediaDeviceInfo[]; value?: string; onChange: (id: string) => void }> = (props) => (
    <label class="flex items-center gap-2 text-xs text-neutral-400">
        <span class="w-14">{props.label}</span>
        <select class="input text-xs py-1" value={props.value ?? ''} onChange={(e) => props.onChange(e.currentTarget.value)}>
            <option value="">Default</option>
            <For each={props.devices}>{(device) => <option value={device.deviceId}>{device.label || device.deviceId.slice(0, 8)}</option>}</For>
        </select>
    </label>
);

const RemoteMedia: Component<{ stream: MediaStream; hasVideo: boolean; volume: number; sinkId?: string }> = (props) => {
    const attach = (element: HTMLMediaElement) => {
        element.srcObject = props.stream;
        createEffect(() => { element.volume = props.volume; });
        createEffect(() => {
            const sink = props.sinkId;
            if (sink && 'setSinkId' in element) void (element as HTMLMediaElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(sink).catch(() => undefined);
        });
    };
    return (
        <Show when={props.hasVideo} fallback={<audio autoplay ref={attach} />}>
            <video autoplay playsinline class="w-full rounded-md bg-black" ref={attach} />
        </Show>
    );
};

const LocalPreview: Component<{ stream: MediaStream }> = (props) => (
    <video autoplay muted playsinline class="w-full rounded-md bg-black" ref={(element) => { element.srcObject = props.stream; }} />
);

const IconButton: Component<{ title: string; active?: boolean; danger?: boolean; onClick: () => void; children: JSX.Element }> = (props) => (
    <button
        class="aspect-square w-11 rounded-md flex items-center justify-center text-lg transition-colors"
        classList={{
            'bg-neutral-700 hover:bg-neutral-600 text-white': !props.active && !props.danger,
            'bg-red-900/70 hover:bg-red-800 text-red-200': Boolean(props.active),
            'bg-red-600 hover:bg-red-500 text-white': Boolean(props.danger),
        }}
        title={props.title}
        onClick={props.onClick}
    >
        {props.children}
    </button>
);

/** The dropup beside the call controls: which devices are in use, and the ones to switch to. */
const DeviceMenu: Component = () => {
    const { media, call } = useGuilds();
    const [open, setOpen] = createSignal(false);
    return (
        <div class="relative">
            <IconButton title="Devices" onClick={() => { setOpen(!open()); void media.refreshDevices(); }}>
                <BsChevronUp classList={{ 'rotate-180': open() }} />
            </IconButton>
            <Show when={open()}>
                <div class="absolute bottom-full right-0 mb-2 w-96 bg-neutral-800 border border-neutral-700 rounded-lg p-3 space-y-3 z-20 shadow-xl">
                    <div class="space-y-1">
                        <DevicePicker label="Mic" devices={media.state.devices.mics} value={media.state.chosen.mic} onChange={(id) => void media.switchMic(id)} />
                        <div class="flex items-center gap-2 pl-16">
                            <Level level={media.state.localLevel} />
                            <span class="text-xs text-neutral-500 truncate">{media.state.micLabel ?? 'not open'}</span>
                        </div>
                    </div>
                    <div class="space-y-1">
                        <DevicePicker label="Camera" devices={media.state.devices.cameras} value={media.state.chosen.camera} onChange={(id) => void media.switchCamera(id)} />
                        <p class="pl-16 text-xs text-neutral-500">{media.state.cameraStream ? `on: ${media.state.cameraStream.getVideoTracks()[0]?.label ?? ''}` : 'off'}</p>
                    </div>
                    <div class="space-y-1">
                        <DevicePicker label="Speaker" devices={media.state.devices.speakers} value={media.state.chosen.speaker} onChange={(id) => media.choose({ speaker: id })} />
                        <label class="flex items-center gap-2 pl-16 text-xs text-neutral-400">
                            <span>Volume</span>
                            <input type="range" min="0" max="1" step="0.05" value={media.state.outputVolume} onInput={(e) => media.setOutputVolume(Number(e.currentTarget.value))} />
                            <span class="w-8">{Math.round(media.state.outputVolume * 100)}%</span>
                        </label>
                    </div>
                    <div class="space-y-1">
                        <p class="text-xs text-neutral-400"><span class="inline-block w-14">Screen</span>{media.state.screenLabel ? `sharing: ${media.state.screenLabel}` : 'not sharing'}</p>
                        <Show when={call()}>
                            <button class="button button-tertiary text-xs ml-14" onClick={() => { void media.setScreen(!call()?.voice.screen); }}>
                                {call()?.voice.screen ? 'Change what you share' : 'Pick a screen or window'}
                            </button>
                        </Show>
                    </div>
                </div>
            </Show>
        </div>
    );
};

/** The bar at the bottom of a voice channel: join, or the in-call controls as icons. */
const CallControls: Component<{ roomJid: string }> = (props) => {
    const { call, media, joinCall, leaveCall, setVoiceState } = useGuilds();
    const inThisCall = () => call()?.roomJid === props.roomJid;
    return (
        <div class="border-t border-neutral-800 p-3 flex items-center justify-center gap-2">
            <Show when={inThisCall()} fallback={<button class="button button-primary" onClick={() => joinCall(props.roomJid)}>Join call</button>}>
                <IconButton title={call()?.voice.muted ? 'Unmute' : 'Mute'} active={call()?.voice.muted} onClick={() => setVoiceState({ muted: !call()?.voice.muted })}>
                    <Show when={call()?.voice.muted} fallback={<BsMicFill />}><BsMicMuteFill /></Show>
                </IconButton>
                <IconButton title={call()?.voice.deafened ? 'Undeafen' : 'Deafen'} active={call()?.voice.deafened} onClick={() => setVoiceState({ deafened: !call()?.voice.deafened })}>
                    <Show when={call()?.voice.deafened} fallback={<BsHeadphones />}><BsVolumeMuteFill /></Show>
                </IconButton>
                <IconButton title={call()?.voice.camera ? 'Camera off' : 'Camera on'} active={!call()?.voice.camera} onClick={() => setVoiceState({ camera: !call()?.voice.camera })}>
                    <Show when={call()?.voice.camera} fallback={<BsCameraVideoOffFill />}><BsCameraVideoFill /></Show>
                </IconButton>
                <IconButton title={call()?.voice.screen ? 'Stop sharing' : 'Share screen'} onClick={() => setVoiceState({ screen: !call()?.voice.screen })}>
                    <BsDisplay classList={{ 'text-emerald-300': Boolean(call()?.voice.screen) }} />
                </IconButton>
                <DeviceMenu />
                <IconButton title="Leave call" danger onClick={leaveCall}>
                    <BsTelephoneXFill />
                </IconButton>
                <span class="text-xs text-neutral-500 pl-2">
                    {call()?.stage === 'preparing' ? 'joining' : `${Object.keys(media.state.remote).length} incoming`}
                </span>
            </Show>
        </div>
    );
};

const VoiceChannel: Component<{ roomJid: string }> = (props) => {
    const { room, call, media, ownJid } = useGuilds();
    const occupants = createMemo(() => Object.values(room(props.roomJid)?.occupants ?? {}).sort((a, b) => a.nick.localeCompare(b.nick)));
    const participants = createMemo(() => occupants().filter((occupant) => occupant.call));
    const streamsOf = (jid?: string) => Object.values(media.state.remote).filter((remote) => remote.owner === jid);
    const levelOf = (jid?: string) => Math.max(0, ...streamsOf(jid).map((remote) => media.state.remoteLevels[remote.sid] ?? 0));
    const speaking = (occupant: Occupant) => (occupant.jid === ownJid() ? isSpeaking(media.state.localLevel) : isSpeaking(levelOf(occupant.jid)));
    const volume = () => (call()?.voice.deafened ? 0 : media.state.outputVolume);

    return (
        <div class="flex-1 flex min-h-0">
            <div class="flex-1 flex flex-col min-w-0">
                <div class="flex-1 p-4 space-y-3 overflow-y-auto">
                    <p class="text-[11px] uppercase tracking-wide text-neutral-500">In call ({participants().length})</p>
                    <Show when={participants().length > 0} fallback={<p class="text-neutral-500">Nobody is in the call.</p>}>
                        <ul class="grid grid-cols-2 gap-3">
                            <For each={participants()}>
                                {(occupant) => (
                                    <li class="bg-neutral-800 rounded-md p-3 space-y-2" classList={{ 'ring-2 ring-emerald-400': speaking(occupant) }}>
                                        <div class="flex items-center gap-3">
                                            <Avatar jid={occupant.jid} name={occupant.nick} size={32} />
                                            <span classList={{ 'text-white': true, 'text-cyan-300': occupant.jid === ownJid() }}>{occupant.nick}</span>
                                            <Level level={occupant.jid === ownJid() ? media.state.localLevel : levelOf(occupant.jid)} />
                                            <VoiceStateIcons state={occupant.call?.voice} joining={occupant.call?.preparing} class="ml-auto text-sm" />
                                        </div>
                                        <Show when={occupant.jid === ownJid()}>
                                            <Show when={media.state.cameraStream}>{(stream) => <LocalPreview stream={stream()} />}</Show>
                                            <Show when={media.state.screenStream}>{(stream) => <LocalPreview stream={stream()} />}</Show>
                                        </Show>
                                        <For each={streamsOf(occupant.jid)}>
                                            {(remote) => <RemoteMedia stream={remote.stream} hasVideo={remote.hasVideo} volume={volume()} sinkId={media.state.chosen.speaker} />}
                                        </For>
                                    </li>
                                )}
                            </For>
                        </ul>
                    </Show>
                    <For each={Object.values(media.state.remote).filter((remote) => !remote.owner || !participants().some((p) => p.jid === remote.owner))}>
                        {(remote) => <RemoteMedia stream={remote.stream} hasVideo={remote.hasVideo} volume={volume()} sinkId={media.state.chosen.speaker} />}
                    </For>
                </div>
                <CallControls roomJid={props.roomJid} />
            </div>
            <div class="w-56 border-l border-neutral-800 p-3 overflow-y-auto">
                <p class="text-[11px] uppercase tracking-wide text-neutral-500 pb-2">In room ({occupants().length})</p>
                <ul class="space-y-1">
                    <For each={occupants()}>
                        {(occupant) => (
                            <li class="flex items-center gap-2 text-sm text-neutral-300">
                                <Avatar jid={occupant.jid} name={occupant.nick} size={22} />
                                <span class="truncate">{occupant.nick}</span>
                            </li>
                        )}
                    </For>
                </ul>
            </div>
        </div>
    );
};

export const ServerChannelRoute: Component = () => {
    const params = useParams<{ groupId: string, channelId: string }>();
    const { channel, room, loadLatestHistory, loadOlderHistory, sendRoomMessage } = useGuilds();
    const [draft, setDraft] = createSignal('');
    let scrollRef: HTMLDivElement | undefined;

    const current = createMemo(() => channel(params.groupId, params.channelId));
    const currentRoom = createMemo(() => {
        const jid = current()?.jid;
        return jid ? room(jid) : undefined;
    });
    const occupants = createMemo(() => Object.values(currentRoom()?.occupants ?? {}).sort((a, b) => a.nick.localeCompare(b.nick)));

    createEffect((previousJid) => {
        const jid = current()?.jid;
        if (!jid || jid === previousJid || current()?.kind !== 'text') return jid;
        void loadLatestHistory(jid).then(() => {
            requestAnimationFrame(() => scrollRef?.scrollTo({ top: scrollRef.scrollHeight }));
        });
        return jid;
    });

    createEffect(() => {
        const count = currentRoom()?.messages.length ?? 0;
        if (count === 0 || !scrollRef) return;
        const distance = scrollRef.scrollHeight - (scrollRef.scrollTop + scrollRef.clientHeight);
        if (distance < 160) requestAnimationFrame(() => scrollRef?.scrollTo({ top: scrollRef.scrollHeight }));
    });

    const handleSend = () => {
        const jid = current()?.jid;
        const body = draft().trim();
        if (!jid || !body) return;
        void sendRoomMessage(jid, body);
        setDraft('');
    };

    return (
        <div class="w-full h-screen flex flex-col bg-neutral-900">
            <div class="w-full p-2.5 bg-neutral-900 border-b border-neutral-800">
                <div class="flex items-center gap-2">
                    <Show when={current()?.kind === 'voice'} fallback={<BsHash />}>
                        <BsVolumeUp />
                    </Show>
                    <span>{params.channelId}</span>
                    <span class="text-xs text-neutral-500 truncate">{current()?.jid}</span>
                </div>
            </div>
            <Show when={current()} fallback={<p class="p-4 text-neutral-400">No channel named {params.channelId} in this guild.</p>}>
                <Show when={current()?.kind === 'text'} fallback={<VoiceChannel roomJid={current()?.jid ?? ''} />}>
                    <div class="flex-1 flex min-h-0">
                        <div class="flex-1 flex flex-col min-w-0">
                            <div
                                ref={scrollRef}
                                class="flex-1 overflow-y-auto p-4"
                                onScroll={(e) => {
                                    const jid = current()?.jid;
                                    if (jid && e.currentTarget.scrollTop < 120 && currentRoom()?.hasOlder) void loadOlderHistory(jid);
                                }}
                            >
                                <div class="min-h-full flex flex-col justify-end gap-2">
                                    <Show when={(currentRoom()?.messages.length ?? 0) === 0}>
                                        <p class="text-neutral-500">No messages yet.</p>
                                    </Show>
                                    <For each={currentRoom()?.messages ?? []}>
                                        {(message) => (
                                            <div class="flex gap-2 items-start">
                                                <Avatar jid={currentRoom()?.occupants[message.nick]?.jid} name={message.nick} size={28} />
                                                <div class="min-w-0">
                                                    <div class="flex items-baseline gap-2">
                                                        <span classList={{ 'text-sm font-medium': true, 'text-cyan-300': message.ownMessage, 'text-white': !message.ownMessage }}>{message.nick}</span>
                                                        <span class="text-[11px] text-neutral-500">{timeLabel(message.timestamp)}</span>
                                                    </div>
                                                    <p class="text-sm text-neutral-200 whitespace-pre-wrap break-words">{message.body}</p>
                                                </div>
                                            </div>
                                        )}
                                    </For>
                                </div>
                            </div>
                            <div class="p-3 border-t border-neutral-800 flex gap-2">
                                <input
                                    class="input flex-1"
                                    placeholder={`Message #${params.channelId}`}
                                    value={draft()}
                                    onInput={(e) => setDraft(e.currentTarget.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                />
                                <button class="button button-primary" onClick={handleSend}>Send</button>
                            </div>
                        </div>
                        <div class="w-56 border-l border-neutral-800 p-3 overflow-y-auto">
                            <p class="text-[11px] uppercase tracking-wide text-neutral-500 pb-2">Members ({occupants().length})</p>
                            <ul class="space-y-1">
                                <For each={occupants()}>
                                    {(occupant) => (
                                        <li class="flex items-center gap-2 text-sm text-neutral-300">
                                            <Avatar jid={occupant.jid} name={occupant.nick} size={22} />
                                            <span class="truncate">{occupant.nick}</span>
                                        </li>
                                    )}
                                </For>
                            </ul>
                        </div>
                    </div>
                </Show>
            </Show>
        </div>
    )
}
