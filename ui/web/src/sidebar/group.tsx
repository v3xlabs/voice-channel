import { Component, Show } from "solid-js"
import { oklchFromSeed } from "../utils/color";
import { ContextMenu } from "@kobalte/core/context-menu";
import { IdIcon } from "../icon";
import type { GuildManifest } from "../xmpp/guild";

export const GuildIcon: Component<{ guild: GuildManifest }> = (props) => {
    const color = oklchFromSeed(props.guild.slug);

    return (
        <div class="relative group">
            <ContextMenu>
                <ContextMenu.Trigger>
                    <a href={`/server/${props.guild.slug}`} class="text-white text-md rounded-sm w-10 aspect-square flex items-center justify-center cursor-pointer overflow-hidden"
                        style={{ background: color }}
                    >
                        <Show when={props.guild.iconUrl} fallback={props.guild.name.at(0)}>
                            <img src={props.guild.iconUrl} alt={props.guild.name} class="w-full h-full object-cover" />
                        </Show>
                    </a>
                    <div class="absolute hidden z-10 group-hover:flex gap-1 bg-neutral-700 max-w-64 text-white items-baseline p-2 w-max rounded-lg left-full top-1/2 -translate-y-1/2 ml-3 before:content-[''] before:absolute before:-left-1 before:top-1/2 before:-translate-y-1/2 before:w-3 before:h-3 before:bg-neutral-700 before:rotate-45 before:-z-10">
                        <div class="w-3 h-3 aspect-square bg-neutral-200 rounded-sm"></div>
                        <div class="text-sm">
                            {props.guild.name}
                        </div>
                    </div>
                </ContextMenu.Trigger>
                <ContextMenu.Portal>
                    <ContextMenu.Content class="context-menu__content">
                        <ContextMenu.Item class="context-menu__item" disabled>
                            Mark as Read
                        </ContextMenu.Item>
                        <ContextMenu.Separator class="context-menu__separator" />
                        <ContextMenu.Item class="context-menu__item">
                            Invite to Group
                        </ContextMenu.Item>
                        <ContextMenu.Separator class="context-menu__separator" />
                        <ContextMenu.Item class="context-menu__item">
                            Mute Group
                        </ContextMenu.Item>
                        <ContextMenu.Item class="context-menu__item">
                            Notification settings
                        </ContextMenu.Item>
                        <ContextMenu.Separator class="context-menu__separator" />
                        <ContextMenu.Item class="context-menu__item justify-between">
                            <span>
                                Copy Server ID
                            </span>
                            <IdIcon />
                        </ContextMenu.Item>
                    </ContextMenu.Content>
                </ContextMenu.Portal>
            </ContextMenu>
        </div>
    )
};
