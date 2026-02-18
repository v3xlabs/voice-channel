import { Component, For } from "solid-js";
import { Server } from ".";
import { GroupIcon } from "./group";

export const ServerGroup: Component<{ server: Server }> = (props) => {

    if (props.server.groups.length === 1) return <GroupIcon group={props.server.groups[0]} />

    return (
        <div class="bg-amber-700 rounded-lg flex flex-col gap-2 items-center p-1.5">
            <For each={props.server.groups}>
                {(group) => (
                    <GroupIcon group={group} />
                )}
            </For>
        </div>
    )
};