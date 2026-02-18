import { RouteSectionProps } from "@solidjs/router"
import { Component, createMemo, createResource, Show, Suspense } from "solid-js"
import { useParams } from "@solidjs/router";
import { useAuth } from "../../auth/provider";
import { BsHash } from "solid-icons/bs";

export const ServerChannelRoute: Component = () => {
    const params = useParams<{ groupId: string, channelId: string }>();

    const { fetchApi } = useAuth();
    const channelId = createMemo(() => params.channelId);
    const [channel] = createResource(channelId, async (channel_id) => {
        return fetchApi()('/channels/id/{id}', 'get', { path: { id: channel_id } }).then(res => res.data);
    });

    return (
        <div class="w-full">
            <div class="w-full p-2.5 bg-neutral-900">
                <div class="flex items-center gap-2">
                    <BsHash />
                    <span>{channel()?.name || channelId()}</span>
                </div>
            </div>
            <div class="p-4 space-y-4">
                <div class="bg-neutral-800 rounded-md p-4">
                    <p>
                        Server Channel
                    </p>
                    <p>
                        {params.groupId}
                    </p>
                    <p>
                        {params.channelId}
                    </p>
                </div>
                <Suspense fallback={<div>Loading...</div>}>
                    <Show when={channel()} keyed>
                        <div>
                            <pre class="p-4 bg-neutral-800 rounded-md">
                                {JSON.stringify(channel(), null, 2)}
                            </pre>
                        </div>
                    </Show>
                </Suspense>
            </div>
        </div>
    )
}
