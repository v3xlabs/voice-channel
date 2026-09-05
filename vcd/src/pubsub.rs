use anyhow::Result;
use tokio_xmpp::jid::Jid;
use tokio_xmpp::minidom::Element;
use tokio_xmpp::parsers::data_forms::{DataForm, DataFormType, Field, FieldType};
use tokio_xmpp::parsers::iq::Iq;
use tokio_xmpp::parsers::ns;
use tokio_xmpp::parsers::pubsub::owner::{Owner, Payload as OwnerPayload};
use tokio_xmpp::parsers::pubsub::pubsub::{Configure, Create, Item, PubSub, Publish, Retract};
use tokio_xmpp::parsers::pubsub::{ItemId, NodeName};
use tokio_xmpp::parsers::stanza_error::DefinedCondition;
use tracing::info;

use crate::manifest::{GUILDS_NODE, guild_node, manifest, summary};
use crate::session::{Session, condition_of};
use crate::store::Guild;

fn node_config(open: bool) -> DataForm {
    DataForm::new(
        DataFormType::Submit,
        ns::PUBSUB_CONFIGURE,
        vec![
            Field::text_single(
                "pubsub#access_model",
                if open { "open" } else { "whitelist" },
            ),
            Field::new("pubsub#persist_items", FieldType::Boolean).with_value("1"),
            Field::text_single("pubsub#max_items", "max"),
        ],
    )
}

fn from_actor(session: &Session, iq: Iq) -> Result<Iq> {
    let instance = &session.instance;
    Ok(iq
        .with_from(Jid::new(&instance.actor())?)
        .with_to(Jid::new(&instance.pubsub)?))
}

async fn ensure_node(session: &Session, node: &str, open: bool) -> Result<()> {
    let create = PubSub::Create {
        create: Create {
            node: Some(NodeName(node.to_string())),
        },
        configure: Some(Configure {
            form: Some(node_config(open)),
        }),
    };
    let result = session
        .request(from_actor(
            session,
            Iq::from_set(session.next_id(), create),
        )?)
        .await;
    match result {
        Ok(_) => Ok(()),
        Err(err) if condition_of(&err) == Some(&DefinedCondition::Conflict) => {
            let configure = Owner {
                payload: OwnerPayload::Configure {
                    node: Some(NodeName(node.to_string())),
                    form: Some(node_config(open)),
                },
            };
            session
                .request(from_actor(
                    session,
                    Iq::from_set(session.next_id(), configure),
                )?)
                .await?;
            Ok(())
        }
        Err(err) => Err(err),
    }
}

async fn publish(session: &Session, node: &str, id: &str, payload: Element) -> Result<()> {
    let publish = PubSub::Publish {
        publish: Publish {
            node: NodeName(node.to_string()),
            items: vec![Item {
                id: Some(ItemId(id.to_string())),
                publisher: None,
                payload: Some(payload),
            }],
        },
        publish_options: None,
    };
    session
        .request(from_actor(
            session,
            Iq::from_set(session.next_id(), publish),
        )?)
        .await?;
    Ok(())
}

/// Write the manifest node and the guild list entry so they match `guild`.
pub async fn sync(session: &Session, guild: &Guild) -> Result<()> {
    let node = guild_node(&guild.slug);
    ensure_node(session, &node, guild.public).await?;
    publish(session, &node, "manifest", manifest(guild)).await?;
    ensure_node(session, GUILDS_NODE, true).await?;
    if guild.public {
        publish(session, GUILDS_NODE, &guild.slug, summary(guild)).await?;
    } else {
        retract(session, GUILDS_NODE, &guild.slug).await?;
    }
    info!(slug = %guild.slug, "manifest published");
    Ok(())
}

async fn retract(session: &Session, node: &str, id: &str) -> Result<()> {
    let retract = PubSub::Retract(Retract {
        node: NodeName(node.to_string()),
        notify: false,
        items: vec![Item {
            id: Some(ItemId(id.to_string())),
            publisher: None,
            payload: None,
        }],
    });
    match session
        .request(from_actor(
            session,
            Iq::from_set(session.next_id(), retract),
        )?)
        .await
    {
        Ok(_) => Ok(()),
        Err(err) if condition_of(&err) == Some(&DefinedCondition::ItemNotFound) => Ok(()),
        Err(err) => Err(err),
    }
}

/// Delete the manifest node and the guild list entry.
pub async fn remove(session: &Session, slug: &str) -> Result<()> {
    let delete = Owner {
        payload: OwnerPayload::Delete {
            node: NodeName(guild_node(slug)),
            redirect_uri: None,
        },
    };
    match session
        .request(from_actor(
            session,
            Iq::from_set(session.next_id(), delete),
        )?)
        .await
    {
        Ok(_) => {}
        Err(err) if condition_of(&err) == Some(&DefinedCondition::ItemNotFound) => {}
        Err(err) => return Err(err),
    }
    retract(session, GUILDS_NODE, slug).await
}
