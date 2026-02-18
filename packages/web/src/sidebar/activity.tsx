import { useParams } from "@solidjs/router";
import { createMemo, createResource, Show } from "solid-js";
import { useAuth } from "../auth/provider";

export const SidebarActivity = () => {
    const { fetchApi } = useAuth();
    const params = useParams<{ groupId: string, channelId: string }>();
    const channelId = createMemo(() => params.channelId);
    const hasChannelId = createMemo(() => channelId() !== undefined);

    const [channel] = createResource(channelId, async (channel_id) => {
        return fetchApi()('/channels/id/{id}', 'get', { path: { id: channel_id } }).then(res => res.data);
    });

    return (
        <Show when={hasChannelId()}>
            <div class="w-full bg-amber-700 translate-y-2 pb-4 p-2 -z-10 rounded-t-md">
                <p># {channel()?.name || channelId()}</p>
            </div>
        </Show>
    )
};