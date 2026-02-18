import { Component } from "solid-js"
import { Group } from "."
import { oklchFromSeed } from "../utils/color";

export const GroupIcon: Component<{ group: Group }> = (props) => {
    const icon = props.group.icon;
    const firstLetter = props.group.name.at(0);
    const color = oklchFromSeed(props.group.groupId);

    console.log(color);

    return (
        <div class="relative group">
            <button class="text-white text-md rounded-sm w-10 aspect-square flex items-center justify-center cursor-pointer"
                style={{ background: color }}
            >
                {icon || firstLetter}
            </button>
            <div class="absolute hidden group-hover:flex gap-1 bg-neutral-700 max-w-64 text-white items-baseline p-2 w-max rounded-lg left-full top-1/2 -translate-y-1/2 ml-3 before:content-[''] before:absolute before:-left-1 before:top-1/2 before:-translate-y-1/2 before:w-3 before:h-3 before:bg-neutral-700 before:rotate-45 before:-z-10">
                <div class="w-3 h-3 aspect-square bg-neutral-200 rounded-sm"></div>
                <div class="text-sm">
                    {props.group.name}
                </div>
            </div>
        </div>
    )
};
