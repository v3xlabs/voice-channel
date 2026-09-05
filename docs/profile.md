# voice.channel profile

voice.channel is a profile of XMPP. An instance is an XMPP domain that runs the
services in this document. A client that follows this document gets a Discord-shaped
experience: guilds, text channels, and voice channels you can walk into. Any other XMPP
client gets the same rooms, messages, roster, and encryption, and can see who is in a
voice channel.

This document is the contract between an instance and a client. It says what an
instance must run and expose, what a client must speak, and which parts are standard
XMPP, which are other people's proposals we adopt, and which are ours.

Status: draft, 2026-09-05. The XEPs this profile targets are tracked in `xeps.md`.

## 1. Terms

| Term | Meaning |
| --- | --- |
| Instance | One XMPP domain, for example `voice.channel`, running Prosody, `vcd`, Galene, and a TURN server. |
| Guild | A named collection of channels on one instance. A presentation concept. Under the hood: a set of MUC rooms and one PubSub node that lists them. |
| Channel | One MUC room. Kind `text` or `voice`. |
| Text channel | A room used for messages. |
| Voice channel | A room that also hosts a call. Being in the call is being in the room with Muji presence. |
| Member | A user that holds a `member` or higher affiliation on every room of a guild. |
| Conference service | The JID at which a client sends and receives media streams for a voice channel. Served by `vcd`, backed by Galene. |
| `vcd` | The voice.channel daemon. A XEP-0114 external component beside Prosody. |

## 2. What an instance runs

| Process | Role |
| --- | --- |
| Prosody | Accounts, SASL, s2s, MUC, PubSub, MAM, HTTP upload, external service discovery. |
| `vcd` | Guild manifests, room provisioning, membership sync, invites, the conference service. |
| Galene | The SFU. Reached only by `vcd`. Never by a client. |
| coturn | TURN. Credentials handed out through XEP-0215. |

Prosody owns accounts. A user's password works in any XMPP client. Passwordless login for
the voice.channel app comes later through SASL2 (XEP-0388) and FAST (XEP-0484) and does
not remove the password.

### 2.1 Required server-side XEPs

| XEP | Why |
| --- | --- |
| 0030 Service Discovery | Everything below is discovered with it. |
| 0045 Multi-User Chat | Every channel is a room. |
| 0060 Publish-Subscribe | Guild manifests. |
| 0077 In-Band Registration | Accepting an invite creates the account. |
| 0114 External Components | How `vcd` attaches. |
| 0115 Entity Capabilities | Clients advertise call support. |
| 0163 Personal Eventing | OMEMO device lists and bundles. |
| 0198 Stream Management | Reconnects without losing stanzas. |
| 0215 External Service Discovery | TURN credentials, version `urn:xmpp:extdisco:2`. |
| 0280 Message Carbons | Multi-device. |
| 0313 Message Archive Management | Channel history. Enabled on every room. |
| 0352 Client State Indication | Mobile clients. |
| 0363 HTTP File Upload | Attachments. |
| 0379 Pre-Authenticated Roster Subscription | The `preauth` token that a registration carries. |
| 0401 Ad-hoc Account Invitation | Invite links. |
| 0402 PEP Native Bookmarks | Joined rooms follow the account across clients. |
| 0410 MUC Self-Ping | Clients detect a silent drop from a room. |
| 0421 Anonymous unique occupant identifiers | Stable identity for occupants. |

Prosody ships all of these in core or in the community module repository.

### 2.2 Subdomains

| JID | Service |
| --- | --- |
| `<domain>` | Accounts. Lists the others in `disco#items`. |
| `rooms.<domain>` | MUC service. Every channel lives here. |
| `pubsub.<domain>` | PubSub service. Guild manifests live here. |
| `upload.<domain>` | HTTP upload. |
| `vc.<domain>` | `vcd`. Conference service and guild administration. |

A client finds each of them with `disco#items` on the domain and `disco#info` on each
item. No hostname in this table is hard-coded in a client.

## 3. Guilds

### 3.1 The manifest

A guild is a PubSub node on `pubsub.<domain>`. The node name is
`urn:voice.channel:guild:<slug>`, where `<slug>` matches `[a-z0-9-]{1,32}`. The node
holds one item with id `manifest`. `vcd` is the node owner. The access model is `open`
for a public guild and `whitelist` for a private guild, with the members as the
whitelist.

The item payload:

```xml
<guild xmlns="urn:voice.channel:guild:0" slug="v3x">
  <name>V3X Labs</name>
  <description>Where the tools get built.</description>
  <icon url="https://upload.voice.channel/…/icon.png"/>
  <category name="Text">
    <channel kind="text"
             jid="v3x.general@rooms.voice.channel"
             name="general"/>
    <channel kind="text"
             jid="v3x.builds@rooms.voice.channel"
             name="builds"/>
  </category>
  <category name="Voice">
    <channel kind="voice"
             jid="v3x.lounge@rooms.voice.channel"
             conference="v3x.lounge@vc.voice.channel"
             name="Lounge"/>
  </category>
</guild>
```

Rules:

- Order in the document is display order. There is no `order` attribute.
- `kind` is `text` or `voice`.
- A `voice` channel carries `conference`, the JID of its conference service.
- `jid` is a room on the instance's MUC service. A manifest never lists a room on
  another instance.
- `icon` is optional. The URL is served by the instance's HTTP upload service.

The list of public guilds on an instance is the node `urn:voice.channel:guilds` on the
same PubSub service, one item per guild, item id equal to the slug, payload the
`<guild>` element with only `slug`, `name`, `description`, and `icon`.

### 3.2 Rooms

A channel is a MUC room at `<slug>.<channel>@rooms.<domain>`. `vcd` creates the room and
sets its configuration:

| Field | Value |
| --- | --- |
| `muc#roomconfig_persistentroom` | true |
| `muc#roomconfig_publicroom` | true for a public guild, false for a private one |
| `muc#roomconfig_membersonly` | false for a public guild, true for a private one |
| `muc#roomconfig_whois` | `anyone`. Rooms are non-anonymous. Muji and OMEMO both require real JIDs. |
| `muc#roomconfig_enablearchiving` | true |
| `muc#roomconfig_allowinvites` | false. Membership goes through `vcd`. |
| `muc#roomconfig_changesubject` | moderators only |

A voice channel's room additionally returns this field in its `disco#info` form, so a
client that did not read the manifest can still find the conference service:

```xml
<x xmlns="jabber:x:data" type="result">
  <field var="FORM_TYPE" type="hidden">
    <value>urn:voice.channel:voice:0</value>
  </field>
  <field var="conference">
    <value>v3x.lounge@vc.voice.channel</value>
  </field>
</x>
```

### 3.3 Membership

Guild membership is room affiliation. `vcd` holds the guild's member list and applies the
same affiliation to every room in the manifest whenever the list or the manifest changes.
Joining a public guild means sending `vcd` a request, after which `vcd` grants `member`
on every room and adds the user to the manifest node whitelist if the guild is private.

Administration is Ad-Hoc Commands (XEP-0050) on `vc.<domain>`. An instance admin is a
bare JID the daemon is started with; it matches Prosody's admin list. Registration is
closed by default: accounts come from an admin's invite or an admin-created account.

| Node | Who | Effect |
| --- | --- | --- |
| `urn:voice.channel:instance#invite` | instance admin | A XEP-0401 account invite URI, obtained from Prosody. |
| `urn:voice.channel:instance#account` | instance admin | An account with a chosen password, created through Prosody. |
| `urn:voice.channel:guild#create` | instance admin | New manifest node and rooms. The caller becomes `owner`. |
| `urn:voice.channel:guild#join` | anyone | Membership of a public guild. |
| `urn:voice.channel:guild#leave` | a member | Removes affiliations. |
| `urn:voice.channel:guild#channels` | `admin` or `owner` | Add, remove, rename, reorder channels. |
| `urn:voice.channel:guild#members` | `admin` or `owner` | Grant or revoke affiliations for the guild. |
| `urn:voice.channel:guild#delete` | `owner` | Destroys the rooms and the node. |

An invite is one token, carried two ways:

```
xmpp:<domain>?register;preauth=<token>
https://<domain>/invite/<token>
```

`instance#invite` returns the URI, which any client with XEP-0401 opens. The link is the
same token on the instance's own web client, for a recipient whose client does not handle
the scheme; Prosody builds it as well, from `invites_page`. Accepting an invite is
XEP-0077 registration on an unauthenticated stream: an IQ carrying
`<preauth xmlns='urn:xmpp:pars:0' token='...'/>`, then a `jabber:iq:register` set with a
username and a password. The first registration that succeeds spends the token.

### 3.4 Roles

MUC affiliations are the only role system in v1. `owner`, `admin`, `member`, and
`outcast` are applied guild-wide by `vcd`. Room roles map onto the conference service as
follows:

| MUC role | Galene permission |
| --- | --- |
| moderator | `op` |
| participant | `present` |
| visitor | `observe` |

## 4. Voice channels

### 4.1 Being in the call

A user is in a voice channel's call when they are an occupant of its room and their room
presence carries XEP-0272 Multiparty Jingle (Muji), namespace `urn:xmpp:jingle:muji:0`.
A client that renders occupants can show a call indicator by looking for that element.
A voice.channel client shows the occupants with Muji presence as the participants.

Joining follows XEP-0272 section 5. The client sends room presence with
`<muji xmlns="urn:xmpp:jingle:muji:0"><preparing/></muji>`, waits until the room
echoes it and no other occupant is in `preparing`, then sends presence again listing the
`<content>` elements it offers. Leaving the call means sending room presence without the
Muji element. Leaving the room leaves the call.

Text channels do not permit Muji presence. `vcd` watches presence in text rooms and
kicks an occupant that sends it, with a status text explaining why.

### 4.2 Voice state

Muted, deafened, camera, and screen share are the four states other participants need to
see before any media flows. They ride in the same room presence as the Muji element:

```xml
<presence to="v3x.lounge@rooms.voice.channel/luc">
  <muji xmlns="urn:xmpp:jingle:muji:0">…</muji>
  <voice xmlns="urn:voice.channel:voice:0">
    <muted/>
    <camera/>
  </voice>
</presence>
```

Each child is present when the state is on. `deafened` implies `muted`. A client sends a
new presence whenever a state changes. This element is ours. It is the only part of the
voice flow that is not a XEP or a proto-XEP.

### 4.3 Media

Media goes to the conference service, never to another participant. The protocol is the
ProtoXEP "Jingle Audio/Video Conferences" (Jérôme Poisson, 2024-07-29,
<https://xmpp.org/extensions/inbox/av_conferences.html>). This profile implements it as
written and adds what it leaves open, listed in section 4.5.

Discovery. `disco#info` on the conference JID returns
`<identity category="conference" type="audio-video"/>` and the feature
`urn:xmpp:jingle:av-conferences:0`.

Sending. The client opens one Jingle session (XEP-0166) to the conference JID with its
outgoing streams. The `<jingle>` element carries
`<conference-info xmlns="urn:xmpp:coin:1" isfocus="true"/>` and
`<muji xmlns="urn:xmpp:jingle:muji:0" room="v3x.lounge@rooms.voice.channel"/>`. Content
uses XEP-0167 RTP, XEP-0176 ICE-UDP, XEP-0320 DTLS-SRTP, XEP-0338 grouping for bundle,
XEP-0339 source-specific media, XEP-0293 RTCP feedback, and XEP-0294 header extensions.
Screen share is a second video content in the same session.

Receiving. For every other participant's stream the conference service opens a Jingle
session to the client, one unidirectional stream per session. Each carries
`<conference-info xmlns="urn:xmpp:coin:1"><users><user entity="xmpp:romeo@example.org"/></users></conference-info>`
so the client attaches the stream to the right occupant. The client accepts with
`recvonly` content.

Simulcast. A sending client may offer rid-based simulcast layers. The conference service
forwards the layer the receiver requested. Layer selection uses XEP-0167 `session-info`
with a `<ridrequest xmlns="urn:voice.channel:voice:0" rid="low"/>` payload from the
receiver. This payload is ours and is one of the additions in section 4.5.

Codecs. An instance must accept Opus and VP8. VP9, AV1, and H.264 are optional. A client
must send Opus and VP8 at minimum.

TURN. Before opening a session the client asks the instance domain for services with
XEP-0215 `urn:xmpp:extdisco:2`. The host instance of the guild serves the credentials, so
a client on another instance asks the guild's domain, not its own.

Admission. The conference service accepts a `session-initiate` only from a full JID
whose bare JID is a current occupant of the room with Muji presence. It closes every
session of a participant when that participant leaves the room or drops the Muji
element. A moderator kicking an occupant from the room therefore ends their media.

Encryption. DTLS-SRTP between client and conference service. The conference service
decrypts and re-encrypts. The host instance can therefore receive media. A client must
say so in its interface. End-to-end media with SFrame is not part of v1.

### 4.4 Federation

A user on `example.org` joins `v3x.lounge@rooms.voice.channel` over s2s like any room,
sends Muji presence, and sends Jingle to `v3x.lounge@vc.voice.channel` over s2s.
Media flows from the client to the host instance's Galene directly. The user's home
instance carries only signaling. Nothing in this section is specific to voice.channel.

### 4.5 What we add to the proto-XEP

The ProtoXEP does not say how a client learns who else is in the conference, how a
conference relates to a room, how a receiver picks a simulcast layer, or how a client
finds the conference for a room. This profile fills each gap:

| Gap | Our answer | Section |
| --- | --- | --- |
| Who is in the conference | Muji presence in the room | 4.1 |
| Conference to room binding | `<muji room=…/>` in the session, and the room's `disco#info` field | 3.2, 4.3 |
| Layer selection | `ridrequest` in `session-info` | 4.3 |
| Mute and camera state before media | `urn:voice.channel:voice:0` in presence | 4.2 |

Once a client and `vcd` interoperate, these four go to standards@xmpp.org as proposed
additions, so that Dino, Movim, and Libervia can converge on the same thing.

### 4.6 Conventions a second implementer needs

Three details settled during implementation and not covered by the referenced documents.

| Convention | Rule |
| --- | --- |
| Call nick | Prosody shows other occupants only the presence of the first device that joined under a nick. A device that joins the call takes the nick `<nick> (voice)` for the duration and returns to `<nick>` when it leaves. Clients that know this profile group occupants by bare JID. |
| Screen share | A published session whose `sid` starts with `screen-` is a screen share. The conference service labels it apart from the camera. |
| Delivered streams | The `sid` of a session the conference service opens is `<stream id>~<owner bare JID>`. The Coin element is sent as well; the id is for clients whose Jingle stack drops unknown children. |

## 5. Text

Messages, history, reactions, corrections, replies, and attachments are plain XMPP. A
voice.channel client must support:

| XEP | Why |
| --- | --- |
| 0045, 0313, 0402, 0410, 0421 | Rooms, history, bookmarks, self-ping, occupant ids. |
| 0308 Last Message Correction | Edit. |
| 0444 Message Reactions | Reactions. |
| 0461 Message Replies | Reply threads. |
| 0384 OMEMO | Encryption in 1:1 and in rooms. Rooms are non-anonymous and, for private guilds, members-only, which OMEMO needs. |
| 0363 | Attachments. |
| 0085 Chat State Notifications | Typing. |

## 6. Client requirements for voice

A client that wants to join a voice channel must implement, in addition to section 5:

| XEP | Namespace |
| --- | --- |
| 0166 Jingle | `urn:xmpp:jingle:1` |
| 0167 Jingle RTP Sessions | `urn:xmpp:jingle:apps:rtp:1` |
| 0176 ICE-UDP | `urn:xmpp:jingle:transports:ice-udp:1` |
| 0320 DTLS-SRTP | `urn:xmpp:jingle:apps:dtls:0` |
| 0338 Grouping | `urn:xmpp:jingle:apps:grouping:0` |
| 0339 Source-Specific Media | `urn:xmpp:jingle:apps:rtp:ssma:0` |
| 0293 RTCP Feedback | `urn:xmpp:jingle:apps:rtp:rtcp-fb:0` |
| 0294 RTP Header Extensions | `urn:xmpp:jingle:apps:rtp:rtp-hdrext:0` |
| 0215 External Service Discovery | `urn:xmpp:extdisco:2` |
| 0272 Multiparty Jingle | `urn:xmpp:jingle:muji:0` |
| 0298 Conference Information | `urn:xmpp:coin:1` |
| ProtoXEP Jingle A/V Conferences | `urn:xmpp:jingle:av-conferences:0` |
| this profile | `urn:voice.channel:voice:0` |

The first nine are in stanza.js 12.21 already. The last four are a plugin in this
repository.

## 7. Not in this profile

- A federation protocol of our own. XMPP s2s is the federation.
- A media token. The XMPP session is the credential. Galene's token stays between `vcd`
  and Galene on the host.
- Custom named roles. See 3.4.
- End-to-end encrypted media.
- Mobile clients. Conversations and Monal give text on mobile.
