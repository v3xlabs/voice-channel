use crate::xml::AttrStr;
use anyhow::Result;
use tokio_xmpp::jid::Jid;
use tokio_xmpp::minidom::Element;
use tokio_xmpp::parsers::data_forms::{DataForm, DataFormType, Field, FieldType, Option_};
use tokio_xmpp::parsers::iq::Iq;
use tokio_xmpp::parsers::ns;
use tokio_xmpp::parsers::stanza_error::{DefinedCondition, ErrorType};
use tracing::info;

use crate::session::{Session, stanza_error};
use crate::store::{Affiliation, Category, Channel, ChannelKind, Guild};
use crate::{pubsub, rooms};

pub const NS_COMMANDS: &str = "http://jabber.org/protocol/commands";

pub struct CommandSpec {
    pub node: &'static str,
    pub name: &'static str,
}

pub const COMMANDS: &[CommandSpec] = &[
    CommandSpec {
        node: "urn:voice.channel:instance#invite",
        name: "Create an account invite",
    },
    CommandSpec {
        node: "urn:voice.channel:instance#account",
        name: "Create an account",
    },
    CommandSpec {
        node: "urn:voice.channel:guild#create",
        name: "Create a guild",
    },
    CommandSpec {
        node: "urn:voice.channel:guild#join",
        name: "Join a guild",
    },
    CommandSpec {
        node: "urn:voice.channel:guild#leave",
        name: "Leave a guild",
    },
    CommandSpec {
        node: "urn:voice.channel:guild#channels",
        name: "Add or remove a channel",
    },
    CommandSpec {
        node: "urn:voice.channel:guild#members",
        name: "Set a member's affiliation",
    },
    CommandSpec {
        node: "urn:voice.channel:guild#delete",
        name: "Delete a guild",
    },
];

/// Commands only an instance admin may run.
pub fn admin_only(node: &str) -> bool {
    node.starts_with("urn:voice.channel:instance#") || node == "urn:voice.channel:guild#create"
}

fn bad_request(text: impl Into<String>) -> anyhow::Error {
    stanza_error(ErrorType::Modify, DefinedCondition::BadRequest, text)
}

fn forbidden(text: impl Into<String>) -> anyhow::Error {
    stanza_error(ErrorType::Auth, DefinedCondition::Forbidden, text)
}

fn not_found(text: impl Into<String>) -> anyhow::Error {
    stanza_error(ErrorType::Cancel, DefinedCondition::ItemNotFound, text)
}

pub async fn handle_set(session: &Session, iq: &Iq, payload: &Element) -> Result<Option<Iq>> {
    if !payload.is("command", NS_COMMANDS) {
        return Err(stanza_error(
            ErrorType::Cancel,
            DefinedCondition::ServiceUnavailable,
            "unsupported request",
        ));
    }
    let node = payload
        .attr("node")
        .ok_or_else(|| bad_request("command without node"))?;
    let spec = COMMANDS
        .iter()
        .find(|command| command.node == node)
        .ok_or_else(|| not_found("no such command"))?;
    let requester = iq
        .from()
        .ok_or_else(|| bad_request("no sender"))?
        .to_bare()
        .to_string();
    let action = payload.attr("action").unwrap_or("execute");
    let submitted = payload
        .get_child("x", ns::DATA_FORMS)
        .map(|x| DataForm::try_from(x.clone()))
        .transpose()?;

    let reply = match (action, submitted) {
        ("cancel", _) => command_reply(node, "canceled", None, None),
        (_, Some(form)) if form.type_ == DataFormType::Submit => {
            let note = execute(session, spec.node, &requester, &form).await?;
            command_reply(node, "completed", None, Some(&note))
        }
        _ => command_reply(node, "executing", Some(form_for(spec)), None),
    };
    Ok(Some(Iq::from_result(iq.id(), Some(reply))))
}

fn command_reply(
    node: &str,
    status: &str,
    form: Option<DataForm>,
    note: Option<&str>,
) -> CommandResult {
    let mut builder = Element::builder("command", NS_COMMANDS)
        .attr_str("node", node)
        .attr_str("status", status)
        .attr_str("sessionid", node);
    if form.is_some() {
        builder = builder.append(
            Element::builder("actions", NS_COMMANDS)
                .append(Element::builder("complete", NS_COMMANDS)),
        );
    }
    if let Some(form) = form {
        let element: Element = form.into();
        builder = builder.append(element);
    }
    if let Some(note) = note {
        builder = builder.append(
            Element::builder("note", NS_COMMANDS)
                .attr_str("type", "info")
                .append(note.to_string()),
        );
    }
    CommandResult(builder.build())
}

/// The command element as an IQ result payload.
pub struct CommandResult(Element);

impl From<CommandResult> for Element {
    fn from(value: CommandResult) -> Element {
        value.0
    }
}

impl TryFrom<Element> for CommandResult {
    type Error = tokio_xmpp::FromElementError;
    fn try_from(value: Element) -> std::result::Result<Self, Self::Error> {
        Ok(CommandResult(value))
    }
}

impl tokio_xmpp::parsers::iq::IqResultPayload for CommandResult {}

fn list(var: &str, label: &str, options: &[&str]) -> Field {
    let mut field = Field::new(var, FieldType::ListSingle);
    field.label = Some(label.to_string());
    field.required = true;
    field.options = options
        .iter()
        .map(|value| Option_ {
            label: None,
            value: value.to_string(),
        })
        .collect();
    field
}

fn text(var: &str, label: &str, required: bool) -> Field {
    let mut field = Field::new(var, FieldType::TextSingle);
    field.label = Some(label.to_string());
    field.required = required;
    field
}

fn form_for(spec: &CommandSpec) -> DataForm {
    let slug = || text("slug", "Guild slug", true);
    let fields = match spec.node {
        "urn:voice.channel:instance#invite" => vec![],
        "urn:voice.channel:instance#account" => vec![text("username", "Username", true), {
            let mut password = Field::new("password", FieldType::TextPrivate);
            password.label = Some("Password".to_string());
            password.required = true;
            password
        }],
        "urn:voice.channel:guild#create" => vec![
            slug(),
            text("name", "Guild name", true),
            text("description", "Description", false),
            Field::new("public", FieldType::Boolean).with_value("1"),
        ],
        "urn:voice.channel:guild#channels" => vec![
            slug(),
            list("action", "Action", &["add", "remove"]),
            text("category", "Category", true),
            list("kind", "Kind", &["text", "voice"]),
            text("name", "Channel name", true),
        ],
        "urn:voice.channel:guild#members" => vec![
            slug(),
            {
                let mut jid = Field::new("jid", FieldType::JidSingle);
                jid.label = Some("Member JID".to_string());
                jid.required = true;
                jid
            },
            list(
                "affiliation",
                "Affiliation",
                &["owner", "admin", "member", "none"],
            ),
        ],
        _ => vec![slug()],
    };
    let mut form = DataForm::new(DataFormType::Form, spec.node, fields);
    form.title = Some(spec.name.to_string());
    form
}

fn value<'a>(form: &'a DataForm, var: &str) -> Option<&'a str> {
    form.fields
        .iter()
        .find(|field| field.var.as_deref() == Some(var))
        .and_then(|field| field.values.first())
        .map(String::as_str)
        .filter(|value| !value.is_empty())
}

fn required<'a>(form: &'a DataForm, var: &str) -> Result<&'a str> {
    value(form, var).ok_or_else(|| bad_request(format!("missing field {var}")))
}

fn valid_slug(slug: &str) -> bool {
    !slug.is_empty()
        && slug.len() <= 32
        && slug
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

fn room_node(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect()
}

async fn execute(
    session: &Session,
    node: &str,
    requester: &str,
    form: &DataForm,
) -> Result<String> {
    let instance = &session.instance;
    let is_admin = instance.admins.iter().any(|admin| admin == requester);
    match node {
        "urn:voice.channel:instance#invite" => {
            if !is_admin {
                return Err(forbidden("instance admins only"));
            }
            let invite = crate::admin::create_invite(session).await?;
            info!(admin = requester, "account invite created");
            return Ok(invite.landing_page.unwrap_or(invite.uri));
        }
        "urn:voice.channel:instance#account" => {
            if !is_admin {
                return Err(forbidden("instance admins only"));
            }
            let username = required(form, "username")?;
            if !valid_slug(username) {
                return Err(bad_request("username must match [a-z0-9-]{1,32}"));
            }
            let jid = format!("{username}@{}", instance.domain);
            crate::admin::create_account(session, &jid, required(form, "password")?).await?;
            info!(admin = requester, jid, "account created");
            return Ok(format!("Account {jid} created"));
        }
        _ => {}
    }
    let slug = required(form, "slug")?;
    if !valid_slug(slug) {
        return Err(bad_request("slug must match [a-z0-9-]{1,32}"));
    }

    match node {
        "urn:voice.channel:guild#create" => {
            if !is_admin {
                return Err(forbidden("instance admins only"));
            }
            if instance.store.get(slug).await.is_some() {
                return Err(stanza_error(
                    ErrorType::Cancel,
                    DefinedCondition::Conflict,
                    "guild exists",
                ));
            }
            let general = Channel {
                kind: ChannelKind::Text,
                name: "general".to_string(),
                jid: format!("{slug}.general@{}", instance.rooms),
                conference: None,
            };
            let mut guild = Guild {
                slug: slug.to_string(),
                name: required(form, "name")?.to_string(),
                description: value(form, "description").map(str::to_string),
                icon_url: None,
                public: value(form, "public").is_none_or(|v| v == "1" || v == "true"),
                categories: vec![Category {
                    name: "Text".to_string(),
                    channels: vec![general.clone()],
                }],
                members: Default::default(),
            };
            guild
                .members
                .insert(requester.to_string(), Affiliation::Owner);
            rooms::ensure_room(session, &guild, &general).await?;
            instance.store.put(guild.clone()).await?;
            pubsub::sync(session, &guild).await?;
            info!(slug, owner = requester, "guild created");
            Ok(format!("Guild {slug} created"))
        }
        "urn:voice.channel:guild#join" => {
            let mut guild = instance
                .store
                .get(slug)
                .await
                .ok_or_else(|| not_found("no such guild"))?;
            if !guild.public {
                return Err(forbidden("guild is private"));
            }
            if guild.members.contains_key(requester) {
                return Ok(format!("Already a member of {slug}"));
            }
            guild
                .members
                .insert(requester.to_string(), Affiliation::Member);
            rooms::sync_member(session, &guild, requester, Some(Affiliation::Member)).await?;
            instance.store.put(guild.clone()).await?;
            pubsub::sync(session, &guild).await?;
            Ok(format!("Joined {slug}"))
        }
        "urn:voice.channel:guild#leave" => {
            let mut guild = instance
                .store
                .get(slug)
                .await
                .ok_or_else(|| not_found("no such guild"))?;
            if guild.affiliation_of(requester) == Some(Affiliation::Owner) {
                return Err(forbidden(
                    "the owner cannot leave; delete the guild or hand over ownership",
                ));
            }
            guild.members.remove(requester);
            rooms::sync_member(session, &guild, requester, None).await?;
            instance.store.put(guild).await?;
            Ok(format!("Left {slug}"))
        }
        "urn:voice.channel:guild#channels" => {
            let mut guild = instance
                .store
                .get(slug)
                .await
                .ok_or_else(|| not_found("no such guild"))?;
            if !guild
                .affiliation_of(requester)
                .is_some_and(Affiliation::can_administer)
            {
                return Err(forbidden("admins only"));
            }
            let name = required(form, "name")?.to_string();
            let category_name = required(form, "category")?.to_string();
            match required(form, "action")? {
                "add" => {
                    if guild.channels().any(|channel| channel.name == name) {
                        return Err(stanza_error(
                            ErrorType::Cancel,
                            DefinedCondition::Conflict,
                            "channel exists",
                        ));
                    }
                    let kind = match value(form, "kind") {
                        Some("voice") => ChannelKind::Voice,
                        _ => ChannelKind::Text,
                    };
                    let node = format!("{slug}.{}", room_node(&name));
                    let channel = Channel {
                        kind,
                        name: name.clone(),
                        jid: format!("{node}@{}", instance.rooms),
                        conference: (kind == ChannelKind::Voice)
                            .then(|| format!("{node}@{}", instance.component)),
                    };
                    rooms::ensure_room(session, &guild, &channel).await?;
                    match guild
                        .categories
                        .iter_mut()
                        .find(|category| category.name == category_name)
                    {
                        Some(category) => category.channels.push(channel),
                        None => guild.categories.push(Category {
                            name: category_name,
                            channels: vec![channel],
                        }),
                    }
                }
                "remove" => {
                    let Some(channel) = guild
                        .channels()
                        .find(|channel| channel.name == name)
                        .cloned()
                    else {
                        return Err(not_found("no such channel"));
                    };
                    rooms::destroy_room(session, &channel.jid).await?;
                    for category in &mut guild.categories {
                        category.channels.retain(|entry| entry.name != name);
                    }
                    guild
                        .categories
                        .retain(|category| !category.channels.is_empty());
                }
                other => return Err(bad_request(format!("unknown action {other}"))),
            }
            instance.store.put(guild.clone()).await?;
            pubsub::sync(session, &guild).await?;
            Ok(format!("Channel {name} updated in {slug}"))
        }
        "urn:voice.channel:guild#members" => {
            let mut guild = instance
                .store
                .get(slug)
                .await
                .ok_or_else(|| not_found("no such guild"))?;
            let actor = guild.affiliation_of(requester);
            if !actor.is_some_and(Affiliation::can_administer) {
                return Err(forbidden("admins only"));
            }
            let target = Jid::new(required(form, "jid")?)
                .map_err(|_| bad_request("invalid jid"))?
                .to_bare()
                .to_string();
            let wanted = required(form, "affiliation")?;
            let affiliation = match wanted {
                "none" => None,
                other => Some(
                    Affiliation::parse(other).ok_or_else(|| bad_request("unknown affiliation"))?,
                ),
            };
            let touches_owner = affiliation == Some(Affiliation::Owner)
                || guild.affiliation_of(&target) == Some(Affiliation::Owner);
            if touches_owner && actor != Some(Affiliation::Owner) {
                return Err(forbidden("only the owner can change ownership"));
            }
            match affiliation {
                Some(affiliation) => {
                    guild.members.insert(target.clone(), affiliation);
                }
                None => {
                    guild.members.remove(&target);
                }
            }
            rooms::sync_member(session, &guild, &target, affiliation).await?;
            instance.store.put(guild.clone()).await?;
            pubsub::sync(session, &guild).await?;
            Ok(format!("{target} is now {wanted} in {slug}"))
        }
        "urn:voice.channel:guild#delete" => {
            let guild = instance
                .store
                .get(slug)
                .await
                .ok_or_else(|| not_found("no such guild"))?;
            if guild.affiliation_of(requester) != Some(Affiliation::Owner) {
                return Err(forbidden("owner only"));
            }
            for channel in guild.channels() {
                rooms::destroy_room(session, &channel.jid).await?;
            }
            pubsub::remove(session, slug).await?;
            instance.store.remove(slug).await?;
            info!(slug, "guild deleted");
            Ok(format!("Guild {slug} deleted"))
        }
        _ => Err(not_found("no such command")),
    }
}
