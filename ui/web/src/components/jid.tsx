import { Component, createMemo, Show } from "solid-js";
import { oklchFromSeed } from "../utils/color";

type JidProps = {
    jid: string;
    class?: string;
    localClass?: string;
    domainClass?: string;
};

const parseJid = (jid: string) => {
    const bare = jid.split('/')[0] || jid;
    const atIndex = bare.indexOf('@');
    if (atIndex < 0) {
        return { local: bare, domain: '' };
    }
    return {
        local: bare.slice(0, atIndex),
        domain: bare.slice(atIndex + 1),
    };
};

export const Jid: Component<JidProps> = (props) => {
    const parts = createMemo(() => parseJid(props.jid));
    const domainColor = createMemo(() => {
        const domain = parts().domain;
        return domain ? oklchFromSeed(domain) : "inherit";
    });

    return (
        <span class={props.class}>
            <span class={props.localClass}>{parts().local}</span>
            <Show when={parts().domain}>
                <span class={props.domainClass} style={{ color: domainColor() }}>
                    @{parts().domain}
                </span>
            </Show>
        </span>
    );
};
