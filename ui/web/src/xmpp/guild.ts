import { attribute, childAttribute, childText, pubsubItemContentAliases, XMLElement } from 'stanza/jxt/index.js';
import type { DefinitionOptions, FieldDefinition } from 'stanza/jxt/index.js';

export const NS_GUILD = 'urn:voice.channel:guild:0';
export const GUILDS_NODE = 'urn:voice.channel:guilds';
export const guildNode = (slug: string) => `urn:voice.channel:guild:${slug}`;

export type GuildChannel = {
    kind: 'text' | 'voice';
    jid: string;
    name: string;
    conference?: string;
};

export type GuildCategory = {
    name: string;
    channels: GuildChannel[];
};

export type GuildManifest = {
    itemType: typeof NS_GUILD;
    slug: string;
    name: string;
    description?: string;
    iconUrl?: string;
    categories: GuildCategory[];
};

const channelKind = (value: string | undefined): GuildChannel['kind'] => (value === 'voice' ? 'voice' : 'text');

const importChannel = (xml: XMLElement): GuildChannel | undefined => {
    const jid = xml.getAttribute('jid');
    const name = xml.getAttribute('name');
    if (!jid || !name) return undefined;
    const conference = xml.getAttribute('conference');
    return { kind: channelKind(xml.getAttribute('kind')), jid, name, ...(conference ? { conference } : {}) };
};

const exportChannel = (channel: GuildChannel): XMLElement =>
    new XMLElement('channel', {
        kind: channel.kind,
        jid: channel.jid,
        name: channel.name,
        ...(channel.conference ? { conference: channel.conference } : {}),
    });

const categoriesField: FieldDefinition<GuildCategory[]> = {
    importer: (xml) =>
        xml.getChildren('category', NS_GUILD).map((category) => ({
            name: category.getAttribute('name') ?? '',
            channels: category
                .getChildren('channel', NS_GUILD)
                .map(importChannel)
                .filter((channel): channel is GuildChannel => channel !== undefined),
        })),
    exporter: (xml, categories) => {
        for (const category of categories) {
            const element = new XMLElement('category', { name: category.name });
            for (const channel of category.channels) element.appendChild(exportChannel(channel));
            xml.appendChild(element);
        }
    },
};

export const GuildProtocol: DefinitionOptions[] = [
    {
        aliases: pubsubItemContentAliases(),
        element: 'guild',
        namespace: NS_GUILD,
        type: NS_GUILD,
        typeField: 'itemType',
        fields: {
            slug: attribute('slug'),
            name: childText(null, 'name'),
            description: childText(null, 'description'),
            iconUrl: childAttribute(null, 'icon', 'url'),
            categories: categoriesField,
        },
    },
];

export const isGuildManifest = (content: unknown): content is GuildManifest =>
    typeof content === 'object' && content !== null && (content as { itemType?: string }).itemType === NS_GUILD;

export const guildChannels = (guild: GuildManifest): GuildChannel[] =>
    guild.categories.flatMap((category) => category.channels);
