import { Component, createMemo } from "solid-js";

type AvatarProps = {
    jid?: string;
    name?: string;
    src?: string;
    presence?: 'offline' | 'online' | 'chat' | 'away' | 'xa' | 'dnd';
    size?: number;
    class?: string;
};

const initialsFrom = (name?: string, jid?: string) => {
    const value = (name || jid || '?').trim();
    if (!value) return '?';
    const parts = value.split(/\s+/).slice(0, 2);
    if (parts.length > 1) return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
    return (value[0] || '?').toUpperCase();
};

export const Avatar: Component<AvatarProps> = (props) => {
    const size = createMemo(() => props.size || 28);
    const initials = createMemo(() => initialsFrom(props.name, props.jid));
    const presenceColor = createMemo(() => {
        const presence = props.presence || 'offline';
        if (presence === 'online' || presence === 'chat') return '#22c55e';
        if (presence === 'away' || presence === 'xa') return '#f59e0b';
        if (presence === 'dnd') return '#ef4444';
        return '#6b7280';
    });

    return (
        <div class={`relative ${props.class || ''}`} style={{ width: `${size()}px`, height: `${size()}px` }}>
            <div
                class="rounded-full bg-neutral-600 text-neutral-100 flex items-center justify-center overflow-hidden w-full h-full"
            >
                {props.src
                    ? <img src={props.src} alt={props.name || props.jid || 'Avatar'} class="w-full h-full object-cover" />
                    : <span class="text-xs font-semibold">{initials()}</span>}
            </div>
            <div
                class="absolute -right-0.5 -bottom-0.5 w-3 h-3 rounded-full border-2 border-neutral-700"
                style={{ "background-color": presenceColor() }}
            />
        </div>
    );
};
