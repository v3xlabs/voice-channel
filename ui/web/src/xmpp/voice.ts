import { XMLElement, childBoolean } from 'stanza/jxt/index.js';
import type { DefinitionOptions, FieldDefinition } from 'stanza/jxt/index.js';

export const NS_MUJI = 'urn:xmpp:jingle:muji:0';
export const NS_VOICE = 'urn:voice.channel:voice:0';
const NS_JINGLE_RTP = 'urn:xmpp:jingle:apps:rtp:1';

/** XEP-0272: the call a room occupant is in, and what they offer to it. */
export type MujiPresence = {
    preparing: boolean;
    contents: MujiContent[];
};

export type MujiContent = {
    name: string;
    media: 'audio' | 'video';
};

/** Our profile: the state other participants need before any media flows. */
export type VoiceState = {
    muted: boolean;
    deafened: boolean;
    camera: boolean;
    screen: boolean;
};

declare module 'stanza/protocol' {
    interface Presence {
        muji?: MujiPresence;
        voiceState?: VoiceState;
    }
}

const contentsField: FieldDefinition<MujiContent[]> = {
    importer: (xml) =>
        xml.getChildren('content').flatMap((content) => {
            const name = content.getAttribute('name');
            const media = content.getChild('description', NS_JINGLE_RTP)?.getAttribute('media');
            if (!name || (media !== 'audio' && media !== 'video')) return [];
            return [{ name, media }];
        }),
    exporter: (xml, contents) => {
        for (const content of contents) {
            const description = new XMLElement('description', { xmlns: NS_JINGLE_RTP, media: content.media });
            xml.appendChild(new XMLElement('content', { name: content.name }, [description]));
        }
    },
};

export const VoiceProtocol: DefinitionOptions[] = [
    {
        element: 'muji',
        namespace: NS_MUJI,
        path: 'presence.muji',
        fields: {
            preparing: childBoolean(null, 'preparing'),
            contents: contentsField,
        },
    },
    {
        element: 'voice',
        namespace: NS_VOICE,
        path: 'presence.voiceState',
        fields: {
            muted: childBoolean(null, 'muted'),
            deafened: childBoolean(null, 'deafened'),
            camera: childBoolean(null, 'camera'),
            screen: childBoolean(null, 'screen'),
        },
    },
];
