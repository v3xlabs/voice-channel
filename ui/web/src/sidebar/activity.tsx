import { useParams } from "@solidjs/router";
import { createMemo, Show } from "solid-js";
import { BsHeadphones, BsMicFill, BsMicMuteFill, BsTelephoneXFill, BsVolumeMuteFill } from "solid-icons/bs";
import { useGuilds } from "../guilds/provider";
import { guildChannels } from "../xmpp/guild";

/** The bottom-left strip: the current channel, or the call you are in with its quick controls. */
export const SidebarActivity = () => {
    const params = useParams<{ groupId: string, channelId: string }>();
    const { call, guilds, leaveCall, setVoiceState, media } = useGuilds();
    const hasChannelId = createMemo(() => params.channelId !== undefined);

    const callPlace = createMemo(() => {
        const roomJid = call()?.roomJid;
        if (!roomJid) return undefined;
        for (const guild of guilds()) {
            const channel = guildChannels(guild).find((entry) => entry.jid === roomJid);
            if (channel) return { guild: guild.name, channel: channel.name, slug: guild.slug };
        }
        return { guild: '', channel: roomJid, slug: '' };
    });

    return (
        <Show when={callPlace()} fallback={
            <Show when={hasChannelId()}>
                <div class="w-full bg-amber-700 translate-y-2 pb-4 p-2 -z-10 rounded-t-md">
                    <p># {params.channelId}</p>
                </div>
            </Show>
        }>
            {(place) => (
                <div class="w-full bg-emerald-800 translate-y-2 pb-4 p-2 -z-10 rounded-t-md flex items-center justify-between gap-2">
                    <a href={`/server/${place().slug}/${place().channel}`} class="min-w-0">
                        <Show
                            when={media.state.captureError}
                            fallback={<p class="text-[11px] text-emerald-200">{call()?.stage === 'ready' ? 'Voice connected' : 'Joining voice'}</p>}
                        >
                            <p class="text-[11px] text-amber-300">Listening only</p>
                        </Show>
                        <p class="text-sm text-white truncate">{place().channel}<span class="text-emerald-200"> / {place().guild}</span></p>
                    </a>
                    <div class="flex items-center gap-1 shrink-0">
                        <button class="button button-tertiary aspect-square w-8 flex items-center justify-center" title={call()?.voice.muted ? 'Unmute' : 'Mute'} onClick={() => setVoiceState({ muted: !call()?.voice.muted })}>
                            <Show when={call()?.voice.muted} fallback={<BsMicFill />}><BsMicMuteFill class="text-red-300" /></Show>
                        </button>
                        <button class="button button-tertiary aspect-square w-8 flex items-center justify-center" title={call()?.voice.deafened ? 'Undeafen' : 'Deafen'} onClick={() => setVoiceState({ deafened: !call()?.voice.deafened })}>
                            <Show when={call()?.voice.deafened} fallback={<BsHeadphones />}><BsVolumeMuteFill class="text-red-300" /></Show>
                        </button>
                        <button class="button button-tertiary aspect-square w-8 flex items-center justify-center text-red-300" title="Leave call" onClick={leaveCall}>
                            <BsTelephoneXFill />
                        </button>
                    </div>
                </div>
            )}
        </Show>
    )
};
