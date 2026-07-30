import { Component } from "solid-js"
import { useParams } from "@solidjs/router";
import { BsHash } from "solid-icons/bs";

export const ServerChannelRoute: Component = () => {
    const params = useParams<{ groupId: string, channelId: string }>();

    return (
        <div class="w-full">
            <div class="w-full p-2.5 bg-neutral-900">
                <div class="flex items-center gap-2">
                    <BsHash />
                    <span>{params.channelId}</span>
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
            </div>
        </div>
    )
}
