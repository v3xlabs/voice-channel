use crate::xml::AttrStr;
use tokio_xmpp::minidom::Element;

use crate::store::{ChannelKind, Guild};

pub const NS_GUILD: &str = "urn:voice.channel:guild:0";
pub const GUILDS_NODE: &str = "urn:voice.channel:guilds";

pub fn guild_node(slug: &str) -> String {
    format!("urn:voice.channel:guild:{slug}")
}

/// The manifest item: the guild's channels in display order.
pub fn manifest(guild: &Guild) -> Element {
    let mut root = header(guild);
    for category in &guild.categories {
        let mut element = Element::builder("category", NS_GUILD)
            .attr_str("name", category.name.as_str())
            .build();
        for channel in &category.channels {
            let kind = match channel.kind {
                ChannelKind::Text => "text",
                ChannelKind::Voice => "voice",
            };
            let mut builder = Element::builder("channel", NS_GUILD)
                .attr_str("kind", kind)
                .attr_str("jid", channel.jid.as_str())
                .attr_str("name", channel.name.as_str());
            if let Some(conference) = &channel.conference {
                builder = builder.attr_str("conference", conference.as_str());
            }
            element.append_child(builder.build());
        }
        root.append_child(element);
    }
    root
}

/// The guild list item: name, description, and icon without the channels.
pub fn summary(guild: &Guild) -> Element {
    header(guild)
}

fn header(guild: &Guild) -> Element {
    let mut builder = Element::builder("guild", NS_GUILD)
        .attr_str("slug", guild.slug.as_str())
        .append(Element::builder("name", NS_GUILD).append(guild.name.clone()));
    if let Some(description) = &guild.description {
        builder =
            builder.append(Element::builder("description", NS_GUILD).append(description.clone()));
    }
    if let Some(icon) = &guild.icon_url {
        builder = builder.append(Element::builder("icon", NS_GUILD).attr_str("url", icon.as_str()));
    }
    builder.build()
}
