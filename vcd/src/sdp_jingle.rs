//! SDP <-> Jingle (XEP-0166, 0167, 0176, 0320, 0338, 0339, 0293, 0294) for the subset
//! that browsers and Galene produce: unified plan, bundle, rtcp-mux, DTLS-SRTP, trickle ICE.
//!
//! Jingle `senders` is absolute (initiator or responder); SDP direction is relative to the
//! party that wrote the SDP. Every function takes the writer's [`Role`] to convert between them.

use std::fmt::Write as _;
use std::io::Cursor;

use anyhow::{Context, Result, anyhow};
use sdp::SessionDescription;
use sdp::description::media::MediaDescription;
use serde_json::{Value, json};
use tokio_xmpp::minidom::Element;

use crate::xml::AttrStr;

pub const NS_JINGLE: &str = "urn:xmpp:jingle:1";
pub const NS_RTP: &str = "urn:xmpp:jingle:apps:rtp:1";
pub const NS_RTCP_FB: &str = "urn:xmpp:jingle:apps:rtp:rtcp-fb:0";
pub const NS_HDREXT: &str = "urn:xmpp:jingle:apps:rtp:rtp-hdrext:0";
pub const NS_SSMA: &str = "urn:xmpp:jingle:apps:rtp:ssma:0";
pub const NS_ICE_UDP: &str = "urn:xmpp:jingle:transports:ice-udp:1";
pub const NS_DTLS: &str = "urn:xmpp:jingle:apps:dtls:0";
pub const NS_GROUPING: &str = "urn:xmpp:jingle:apps:grouping:0";

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Role {
    Initiator,
    Responder,
}

impl Role {
    fn senders_to_direction(self, senders: &str) -> &'static str {
        match (senders, self) {
            ("both", _) => "sendrecv",
            ("none", _) => "inactive",
            ("initiator", Role::Initiator) | ("responder", Role::Responder) => "sendonly",
            _ => "recvonly",
        }
    }

    fn direction_to_senders(self, direction: &str) -> &'static str {
        match (direction, self) {
            ("sendrecv", _) => "both",
            ("inactive", _) => "none",
            ("sendonly", Role::Initiator) | ("recvonly", Role::Responder) => "initiator",
            _ => "responder",
        }
    }
}

// ---------------------------------------------------------------------------
// Jingle -> SDP
// ---------------------------------------------------------------------------

/// Build the SDP that `writer` would have produced for these Jingle contents.
pub fn jingle_to_sdp(jingle: &Element, writer: Role) -> Result<String> {
    let contents: Vec<&Element> = jingle
        .children()
        .filter(|c| c.is("content", NS_JINGLE))
        .collect();
    if contents.is_empty() {
        return Err(anyhow!("jingle without contents"));
    }
    let mids: Vec<&str> = contents.iter().filter_map(|c| c.attr("name")).collect();

    let mut sdp = String::new();
    sdp.push_str("v=0\r\no=- 0 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n");
    let _ = writeln!(sdp, "a=group:BUNDLE {}\r", mids.join(" "));
    sdp.push_str("a=msid-semantic: WMS *\r\n");

    for content in contents {
        let name = content
            .attr("name")
            .ok_or_else(|| anyhow!("content without name"))?;
        let description = content
            .get_child("description", NS_RTP)
            .ok_or_else(|| anyhow!("content {name} without rtp description"))?;
        let transport = content
            .get_child("transport", NS_ICE_UDP)
            .ok_or_else(|| anyhow!("content {name} without ice-udp transport"))?;
        let media = description.attr("media").unwrap_or("audio");
        let payload_types: Vec<&Element> = description
            .children()
            .filter(|c| c.is("payload-type", NS_RTP))
            .collect();
        let ids: Vec<&str> = payload_types.iter().filter_map(|p| p.attr("id")).collect();

        let _ = writeln!(sdp, "m={media} 9 UDP/TLS/RTP/SAVPF {}\r", ids.join(" "));
        sdp.push_str("c=IN IP4 0.0.0.0\r\na=rtcp:9 IN IP4 0.0.0.0\r\n");
        if let Some(ufrag) = transport.attr("ufrag") {
            let _ = writeln!(sdp, "a=ice-ufrag:{ufrag}\r");
        }
        if let Some(pwd) = transport.attr("pwd") {
            let _ = writeln!(sdp, "a=ice-pwd:{pwd}\r");
        }
        if let Some(fingerprint) = transport.get_child("fingerprint", NS_DTLS) {
            let _ = writeln!(
                sdp,
                "a=fingerprint:{} {}\r",
                fingerprint.attr("hash").unwrap_or("sha-256"),
                fingerprint.text().trim()
            );
            let _ = writeln!(
                sdp,
                "a=setup:{}\r",
                fingerprint.attr("setup").unwrap_or("actpass")
            );
        }
        let _ = writeln!(sdp, "a=mid:{name}\r");
        for hdrext in description
            .children()
            .filter(|c| c.is("rtp-hdrext", NS_HDREXT))
        {
            let _ = writeln!(
                sdp,
                "a=extmap:{} {}\r",
                hdrext.attr("id").unwrap_or("1"),
                hdrext.attr("uri").unwrap_or("")
            );
        }
        let _ = writeln!(
            sdp,
            "a={}\r",
            writer.senders_to_direction(content.attr("senders").unwrap_or("both"))
        );
        if description.has_child("rtcp-mux", NS_RTP) {
            sdp.push_str("a=rtcp-mux\r\n");
        }
        for payload in &payload_types {
            let id = payload.attr("id").unwrap_or("0");
            if let Some(codec) = payload.attr("name") {
                let clockrate = payload.attr("clockrate").unwrap_or("8000");
                let channels = payload
                    .attr("channels")
                    .filter(|c| *c != "1")
                    .map(|c| format!("/{c}"))
                    .unwrap_or_default();
                let _ = writeln!(sdp, "a=rtpmap:{id} {codec}/{clockrate}{channels}\r");
            }
            for fb in payload.children().filter(|c| c.is("rtcp-fb", NS_RTCP_FB)) {
                let subtype = fb
                    .attr("subtype")
                    .map(|s| format!(" {s}"))
                    .unwrap_or_default();
                let _ = writeln!(
                    sdp,
                    "a=rtcp-fb:{id} {}{subtype}\r",
                    fb.attr("type").unwrap_or("")
                );
            }
            let params: Vec<String> = payload
                .children()
                .filter(|c| c.is("parameter", NS_RTP))
                .map(|p| match p.attr("name") {
                    Some(name) if !name.is_empty() => {
                        format!("{name}={}", p.attr("value").unwrap_or(""))
                    }
                    _ => p.attr("value").unwrap_or("").to_string(),
                })
                .collect();
            if !params.is_empty() {
                let _ = writeln!(sdp, "a=fmtp:{id} {}\r", params.join(";"));
            }
        }
        for group in description
            .children()
            .filter(|c| c.is("ssrc-group", NS_SSMA))
        {
            let ssrcs: Vec<&str> = group
                .children()
                .filter(|c| c.is("source", NS_SSMA))
                .filter_map(|s| s.attr("ssrc"))
                .collect();
            let _ = writeln!(
                sdp,
                "a=ssrc-group:{} {}\r",
                group.attr("semantics").unwrap_or("FID"),
                ssrcs.join(" ")
            );
        }
        for source in description.children().filter(|c| c.is("source", NS_SSMA)) {
            let ssrc = source.attr("ssrc").unwrap_or("0");
            for parameter in source.children().filter(|c| c.is("parameter", NS_SSMA)) {
                match parameter.attr("value") {
                    Some(value) => {
                        let _ = writeln!(
                            sdp,
                            "a=ssrc:{ssrc} {}:{value}\r",
                            parameter.attr("name").unwrap_or("")
                        );
                    }
                    None => {
                        let _ = writeln!(
                            sdp,
                            "a=ssrc:{ssrc} {}\r",
                            parameter.attr("name").unwrap_or("")
                        );
                    }
                }
            }
        }
        for candidate in transport
            .children()
            .filter(|c| c.is("candidate", NS_ICE_UDP))
        {
            let _ = writeln!(sdp, "a={}\r", candidate_line(candidate));
        }
    }
    Ok(sdp)
}

fn candidate_line(candidate: &Element) -> String {
    let mut line = format!(
        "candidate:{} {} {} {} {} {} typ {}",
        candidate.attr("foundation").unwrap_or("1"),
        candidate.attr("component").unwrap_or("1"),
        candidate.attr("protocol").unwrap_or("udp"),
        candidate.attr("priority").unwrap_or("0"),
        candidate.attr("ip").unwrap_or("0.0.0.0"),
        candidate.attr("port").unwrap_or("0"),
        candidate.attr("type").unwrap_or("host"),
    );
    if let (Some(addr), Some(port)) = (candidate.attr("rel-addr"), candidate.attr("rel-port")) {
        let _ = write!(line, " raddr {addr} rport {port}");
    }
    if let Some(generation) = candidate.attr("generation") {
        let _ = write!(line, " generation {generation}");
    }
    line
}

/// A Jingle `transport-info` candidate as Galene wants it.
pub fn jingle_candidate_to_ice(content: &Element) -> Option<Value> {
    let mid = content.attr("name")?;
    let transport = content.get_child("transport", NS_ICE_UDP)?;
    let candidate = transport
        .children()
        .find(|c| c.is("candidate", NS_ICE_UDP))?;
    let mut init = json!({ "candidate": candidate_line(candidate), "sdpMid": mid });
    if let Some(ufrag) = transport.attr("ufrag") {
        init["usernameFragment"] = Value::String(ufrag.to_string());
    }
    Some(init)
}

// ---------------------------------------------------------------------------
// SDP -> Jingle
// ---------------------------------------------------------------------------

/// One SSRC with its `a=ssrc:<id> name[:value]` parameters.
type SsrcParams = (String, Vec<(String, Option<String>)>);

pub struct JingleBody {
    pub contents: Vec<Element>,
    pub group: Option<Element>,
}

/// Turn SDP written by `writer` into Jingle content elements.
pub fn sdp_to_jingle(sdp_text: &str, writer: Role) -> Result<JingleBody> {
    let session =
        SessionDescription::unmarshal(&mut Cursor::new(sdp_text)).context("parsing sdp")?;
    let session_ufrag = session.attribute("ice-ufrag").cloned();
    let session_pwd = session.attribute("ice-pwd").cloned();
    let session_fingerprint = session.attribute("fingerprint").cloned();
    let session_setup = session.attribute("setup").cloned();

    let mut contents = Vec::new();
    for media in &session.media_descriptions {
        let mid = media_attr(media, "mid").unwrap_or_else(|| contents.len().to_string());
        let direction = ["sendrecv", "sendonly", "recvonly", "inactive"]
            .into_iter()
            .find(|d| media.attribute(d).is_some())
            .unwrap_or("sendrecv");

        let mut description = Element::builder("description", NS_RTP)
            .attr_str("media", media.media_name.media.as_str());
        for format in &media.media_name.formats {
            let mut payload =
                Element::builder("payload-type", NS_RTP).attr_str("id", format.as_str());
            if let Some(rtpmap) = media_attr_for(media, "rtpmap", format) {
                let mut parts = rtpmap.split('/');
                if let Some(name) = parts.next() {
                    payload = payload.attr_str("name", name);
                }
                if let Some(clockrate) = parts.next() {
                    payload = payload.attr_str("clockrate", clockrate);
                }
                if let Some(channels) = parts.next() {
                    payload = payload.attr_str("channels", channels);
                }
            }
            for fb in media_attrs_for(media, "rtcp-fb", format) {
                let mut parts = fb.splitn(2, ' ');
                let mut element = Element::builder("rtcp-fb", NS_RTCP_FB)
                    .attr_str("type", parts.next().unwrap_or(""));
                if let Some(subtype) = parts.next() {
                    element = element.attr_str("subtype", subtype);
                }
                payload = payload.append(element);
            }
            if let Some(fmtp) = media_attr_for(media, "fmtp", format) {
                for param in fmtp.split(';') {
                    let (name, value) = match param.split_once('=') {
                        Some((name, value)) => (name.trim(), value.trim()),
                        None => ("", param.trim()),
                    };
                    payload = payload.append(
                        Element::builder("parameter", NS_RTP)
                            .attr_str("name", name)
                            .attr_str("value", value),
                    );
                }
            }
            description = description.append(payload);
        }
        for extmap in media_attrs(media, "extmap") {
            let mut parts = extmap.splitn(2, ' ');
            let id = parts.next().unwrap_or("1").split('/').next().unwrap_or("1");
            description = description.append(
                Element::builder("rtp-hdrext", NS_HDREXT)
                    .attr_str("id", id)
                    .attr_str("uri", parts.next().unwrap_or("")),
            );
        }
        if media.attribute("rtcp-mux").is_some() {
            description = description.append(Element::builder("rtcp-mux", NS_RTP));
        }
        for group in media_attrs(media, "ssrc-group") {
            let mut parts = group.split_whitespace();
            let mut element = Element::builder("ssrc-group", NS_SSMA)
                .attr_str("semantics", parts.next().unwrap_or("FID"));
            for ssrc in parts {
                element =
                    element.append(Element::builder("source", NS_SSMA).attr_str("ssrc", ssrc));
            }
            description = description.append(element);
        }
        let mut sources: Vec<SsrcParams> = Vec::new();
        for line in media_attrs(media, "ssrc") {
            let (ssrc, rest) = line.split_once(' ').unwrap_or((&line, ""));
            let (name, value) = match rest.split_once(':') {
                Some((name, value)) => (name.to_string(), Some(value.to_string())),
                None => (rest.to_string(), None),
            };
            match sources.iter_mut().find(|(id, _)| id == ssrc) {
                Some((_, params)) => params.push((name, value)),
                None => sources.push((ssrc.to_string(), vec![(name, value)])),
            }
        }
        for (ssrc, params) in sources {
            let mut element = Element::builder("source", NS_SSMA).attr_str("ssrc", ssrc.as_str());
            for (name, value) in params {
                let mut parameter =
                    Element::builder("parameter", NS_SSMA).attr_str("name", name.as_str());
                if let Some(value) = value {
                    parameter = parameter.attr_str("value", value.as_str());
                }
                element = element.append(parameter);
            }
            description = description.append(element);
        }

        let mut transport = Element::builder("transport", NS_ICE_UDP);
        if let Some(ufrag) = media_attr(media, "ice-ufrag").or_else(|| session_ufrag.clone()) {
            transport = transport.attr_str("ufrag", ufrag.as_str());
        }
        if let Some(pwd) = media_attr(media, "ice-pwd").or_else(|| session_pwd.clone()) {
            transport = transport.attr_str("pwd", pwd.as_str());
        }
        if let Some(fingerprint) =
            media_attr(media, "fingerprint").or_else(|| session_fingerprint.clone())
        {
            let (hash, value) = fingerprint
                .split_once(' ')
                .unwrap_or(("sha-256", &fingerprint));
            let setup = media_attr(media, "setup")
                .or_else(|| session_setup.clone())
                .unwrap_or_else(|| "actpass".to_string());
            transport = transport.append(
                Element::builder("fingerprint", NS_DTLS)
                    .attr_str("hash", hash)
                    .attr_str("setup", setup.as_str())
                    .append(value.to_string()),
            );
        }
        for line in media_attrs(media, "candidate") {
            if let Some(candidate) = candidate_element(&line) {
                transport = transport.append(candidate);
            }
        }

        let content = Element::builder("content", NS_JINGLE)
            .attr_str("creator", "initiator")
            .attr_str("name", mid.as_str())
            .attr_str("senders", writer.direction_to_senders(direction))
            .append(description)
            .append(transport)
            .build();
        contents.push(content);
    }

    let group = session.attribute("group").and_then(|group| {
        let mut parts = group.split_whitespace();
        let semantics = parts.next()?;
        let mut element = Element::builder("group", NS_GROUPING).attr_str("semantics", semantics);
        for mid in parts {
            element =
                element.append(Element::builder("content", NS_GROUPING).attr_str("name", mid));
        }
        Some(element.build())
    });

    Ok(JingleBody { contents, group })
}

/// Galene's `ice` message as a Jingle `transport-info` content.
pub fn ice_to_jingle_content(candidate: &Value) -> Option<Element> {
    let line = candidate["candidate"].as_str()?;
    let mid = candidate["sdpMid"].as_str().unwrap_or("0");
    let element = candidate_element(line)?;
    let mut transport = Element::builder("transport", NS_ICE_UDP);
    if let Some(ufrag) = candidate["usernameFragment"].as_str() {
        transport = transport.attr_str("ufrag", ufrag);
    }
    Some(
        Element::builder("content", NS_JINGLE)
            .attr_str("creator", "initiator")
            .attr_str("name", mid)
            .append(transport.append(element))
            .build(),
    )
}

fn candidate_element(line: &str) -> Option<Element> {
    let line = line.strip_prefix("candidate:").unwrap_or(line);
    let mut parts = line.split_whitespace();
    let foundation = parts.next()?;
    let component = parts.next()?;
    let protocol = parts.next()?;
    let priority = parts.next()?;
    let ip = parts.next()?;
    let port = parts.next()?;
    if parts.next()? != "typ" {
        return None;
    }
    let type_ = parts.next()?;
    let mut element = Element::builder("candidate", NS_ICE_UDP)
        .attr_str("component", component)
        .attr_str("foundation", foundation)
        .attr_str("generation", "0")
        .attr_str("id", format!("{}{}", foundation, port).as_str())
        .attr_str("ip", ip)
        .attr_str("port", port)
        .attr_str("priority", priority)
        .attr_str("protocol", protocol.to_ascii_lowercase().as_str())
        .attr_str("type", type_);
    let rest: Vec<&str> = parts.collect();
    for pair in rest.chunks(2) {
        match pair {
            ["raddr", addr] => element = element.attr_str("rel-addr", *addr),
            ["rport", port] => element = element.attr_str("rel-port", *port),
            ["generation", generation] => element = element.attr_str("generation", *generation),
            _ => {}
        }
    }
    Some(element.build())
}

fn media_attr(media: &MediaDescription, key: &str) -> Option<String> {
    media
        .attributes
        .iter()
        .find(|a| a.key == key)
        .and_then(|a| a.value.clone())
}

fn media_attrs(media: &MediaDescription, key: &str) -> Vec<String> {
    media
        .attributes
        .iter()
        .filter(|a| a.key == key)
        .filter_map(|a| a.value.clone())
        .collect()
}

/// Attributes of the form `a=<key>:<payload id> <rest>`, returning `<rest>`.
fn media_attrs_for(media: &MediaDescription, key: &str, payload: &str) -> Vec<String> {
    media_attrs(media, key)
        .into_iter()
        .filter_map(|value| {
            let (id, rest) = value.split_once(' ')?;
            (id == payload).then(|| rest.to_string())
        })
        .collect()
}

fn media_attr_for(media: &MediaDescription, key: &str, payload: &str) -> Option<String> {
    media_attrs_for(media, key, payload).into_iter().next()
}
