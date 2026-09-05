//! Instance administration the daemon performs on Prosody's behalf: account invites and
//! accounts, through Prosody's own Ad-Hoc commands. The daemon's actor JID is a Prosody admin.

use anyhow::{Result, anyhow};
use tokio_xmpp::jid::Jid;
use tokio_xmpp::minidom::Element;
use tokio_xmpp::parsers::data_forms::{DataForm, DataFormType, Field};
use tokio_xmpp::parsers::iq::Iq;
use tokio_xmpp::parsers::ns;

use crate::commands::NS_COMMANDS;
use crate::session::Session;
use crate::xml::AttrStr;

const NODE_CREATE_ACCOUNT_INVITE: &str = "urn:xmpp:invite#create-account";
const NODE_ADD_USER: &str = "http://jabber.org/protocol/admin#add-user";
const FORM_ADMIN: &str = "http://jabber.org/protocol/admin";

async fn run(session: &Session, node: &str, form: Option<DataForm>) -> Result<Element> {
    let mut command = Element::builder("command", NS_COMMANDS)
        .attr_str("node", node)
        .attr_str("action", "execute");
    if let Some(form) = form {
        let element: Element = form.into();
        command = command.append(element);
    }
    let iq = Iq::Set {
        from: Some(Jid::new(&session.instance.actor())?),
        to: Some(Jid::new(&session.instance.domain)?),
        id: session.next_id(),
        payload: command.build(),
    };
    let result = session.request(iq).await?;
    let Iq::Result {
        payload: Some(payload),
        ..
    } = result
    else {
        return Err(anyhow!("empty command result"));
    };
    if payload.attr("status") != Some("completed") {
        return Err(anyhow!("command {node} did not complete"));
    }
    if let Some(note) = payload.get_child("note", NS_COMMANDS)
        && note.attr("type") == Some("error")
    {
        return Err(anyhow!("{}", note.text()));
    }
    Ok(payload)
}

fn field_value(form: &DataForm, var: &str) -> Option<String> {
    form.fields
        .iter()
        .find(|field| field.var.as_deref() == Some(var))
        .and_then(|field| field.values.first())
        .cloned()
        .filter(|value| !value.is_empty())
}

/// A XEP-0401 account invite, as `xmpp:<domain>?register;preauth=<token>`. Clients that
/// handle the scheme open it; the web client turns it into an invite page of its own.
pub async fn create_invite(session: &Session) -> Result<String> {
    let payload = run(session, NODE_CREATE_ACCOUNT_INVITE, None).await?;
    let form = payload
        .get_child("x", ns::DATA_FORMS)
        .cloned()
        .map(DataForm::try_from)
        .transpose()?
        .ok_or_else(|| anyhow!("invite command returned no form"))?;
    field_value(&form, "uri").ok_or_else(|| anyhow!("invite without uri"))
}

/// An account with a chosen password, created directly by the admin.
pub async fn create_account(session: &Session, jid: &str, password: &str) -> Result<()> {
    let form = DataForm::new(
        DataFormType::Submit,
        FORM_ADMIN,
        vec![
            Field::text_single("accountjid", jid),
            Field::text_single("password", password),
            Field::text_single("password-verify", password),
        ],
    );
    run(session, NODE_ADD_USER, Some(form)).await?;
    Ok(())
}
