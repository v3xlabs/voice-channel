import { RouteSectionProps } from "@solidjs/router";
import { Component } from "solid-js";

export const ServerOverviewRoute: Component<RouteSectionProps<{ groupId: string }>> = ({ params: { groupId } }) => {
    return (
        <div class="p-4">
            Server {groupId}
            <div class="mt-2 text-sm text-neutral-400">Server overview is currently XMPP-only and does not call REST APIs.</div>
        </div>
    )
};
