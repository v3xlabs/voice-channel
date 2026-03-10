import { useParams } from "@solidjs/router";
import { createMemo, Show } from "solid-js";

export const SidebarActivity = () => {
    const params = useParams<{ groupId: string, channelId: string }>();
    const channelId = createMemo(() => params.channelId);
    const hasChannelId = createMemo(() => channelId() !== undefined);

    return (
        <Show when={hasChannelId()}>
            <div class="w-full bg-amber-700 translate-y-2 pb-4 p-2 -z-10 rounded-t-md">
                <p># {channelId()}</p>
            </div>
        </Show>
    )
};
