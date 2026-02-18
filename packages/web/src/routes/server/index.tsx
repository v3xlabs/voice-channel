import { Route, RouteSectionProps, useParams } from "@solidjs/router";
import { Component, createResource, Show, Suspense } from "solid-js";
import { useAuth } from "../../auth/provider";

export const ServerOverviewRoute: Component<RouteSectionProps<{ groupId: string }>> = ({ params: { groupId } }) => {
    const { fetchApi } = useAuth();
    const [channels] = createResource(async () => {
        return fetchApi()('/health', 'get', {});
    });

    return (
        <div class="p-4">
            Server {groupId}
            <Suspense fallback={<div>Loading...</div>}>
                <Show when={channels()}>
                    <div>
                        {channels()?.data}
                    </div>
                </Show>
            </Suspense>
        </div>
    )
};
