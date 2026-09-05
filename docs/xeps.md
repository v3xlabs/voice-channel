# XEPs we target

One line per extension: what it does and why voice.channel wants it. `profile.md` says
how each is used. Status is the XSF status on 2026-09-05.

Column "where" says which side must implement it: `server` is Prosody or `vcd`, `client`
is the voice.channel app, `both` is both.

## Core, every client and server

| XEP | Name | Status | Where | What it does for us |
| --- | --- | --- | --- | --- |
| 0030 | Service Discovery | Final | both | Finding every service in this list by asking, never by hard-coded hostname. |
| 0045 | Multi-User Chat | Stable | both | Every channel is a room. |
| 0060 | Publish-Subscribe | Stable | both | Guild manifests live in PubSub nodes. |
| 0077 | In-Band Registration | Final | both | The invite page creates the account over the same websocket the client logs in on. |
| 0084 | User Avatar | Stable | both | Profile pictures, published over PEP. |
| 0085 | Chat State Notifications | Final | client | Typing indicators. |
| 0114 | Jabber Component Protocol | Stable | server | How `vcd` attaches to Prosody. |
| 0115 | Entity Capabilities | Stable | both | Clients advertise what they support, so a room knows who can take a call. |
| 0163 | Personal Eventing Protocol | Stable | both | Per-user PubSub. Carries avatars, nicknames, bookmarks, and OMEMO keys. |
| 0172 | User Nickname | Draft | both | Display names that are not the JID. |
| 0198 | Stream Management | Stable | both | Reconnect without losing stanzas. |
| 0215 | External Service Discovery | Stable | both | The instance hands out TURN credentials. |
| 0280 | Message Carbons | Stable | both | Every device of a user sees every message. |
| 0308 | Last Message Correction | Stable | client | Editing a message. |
| 0313 | Message Archive Management | Stable | both | Channel history, paged from the server. |
| 0352 | Client State Indication | Stable | both | Tell the server the app is in the background. |
| 0359 | Unique and Stable Stanza IDs | Stable | server | Server-assigned ids so reactions and replies point at the right message. |
| 0363 | HTTP File Upload | Stable | both | Attachments. |
| 0379 | Pre-Authenticated Roster Subscription | Proposed | both | The `preauth` token that makes a closed instance accept one registration. |
| 0384 | OMEMO Encryption | Experimental | client | End-to-end encrypted text, 1:1 and in rooms. |
| 0388 | Extensible SASL Profile | Stable | both | The login handshake that FAST and passkey login build on. Later. |
| 0401 | Ad-hoc Account Invitation Generation | Experimental | both | Invite links. Any XMPP client opens the URI; the web client opens the link. |
| 0402 | PEP Native Bookmarks | Stable | both | The rooms you joined follow your account. |
| 0410 | MUC Self-Ping | Stable | client | Detect that the server silently dropped you from a room. |
| 0421 | Anonymous unique occupant identifiers | Experimental | server | Stable identity for occupants regardless of nickname. |
| 0444 | Message Reactions | Experimental | client | Reactions. |
| 0461 | Message Replies | Experimental | client | Reply to a specific message. |
| 0484 | Fast Authentication Streamlining Tokens | Experimental | both | Token login after a passkey handshake, without dropping the password. Later. |

## Voice, clients that join a call

| XEP | Name | Status | Where | What it does for us |
| --- | --- | --- | --- | --- |
| 0166 | Jingle | Final | both | Session setup between a client and the conference service. |
| 0167 | Jingle RTP Sessions | Final | both | Describing audio and video streams. |
| 0176 | Jingle ICE-UDP Transport Method | Final | both | NAT traversal for media. |
| 0272 | Multiparty Jingle (Muji) | Experimental | both | Being in a call is Muji presence in the room. This is how any client sees who is in a voice channel. |
| 0293 | Jingle RTP Feedback Negotiation | Stable | both | NACK, PLI, and REMB so video recovers from loss. |
| 0294 | Jingle RTP Header Extensions Negotiation | Stable | both | Audio level and rid header extensions. |
| 0298 | Delivering Conference Information to Jingle Participants (Coin) | Deferred | both | Tells a client which participant a received stream belongs to. |
| 0320 | Use of DTLS-SRTP in Jingle Sessions | Stable | both | Media keys. |
| 0338 | Jingle Grouping Framework | Stable | both | Bundle all streams on one transport. |
| 0339 | Source-Specific Media Attributes in Jingle | Stable | both | SSRC signaling, needed for simulcast. |
| inbox | Jingle Audio/Video Conferences | ProtoXEP | both | Sending media to a server instead of every peer. The conference service speaks this. |

## Ours, until they are upstream

| Namespace | What it does for us |
| --- | --- |
| `urn:voice.channel:guild:0` | The guild manifest and the public guild list. |
| `urn:voice.channel:voice:0` | Muted, deafened, camera, and screen state in presence; the room's conference JID in disco; simulcast layer requests. |

## Considered for later

| XEP | Name | Status | What it does for us |
| --- | --- | --- | --- |
| 0050 | Ad-Hoc Commands | Final | Guild administration commands on `vcd`. In the profile already, listed here because a client needs a form renderer for it. |
| 0353 | Jingle Message Initiation | Stable | Ringing on all devices for 1:1 calls. Not needed for voice channels. |
| 0357 | Push Notifications | Deferred | Mobile push, when a mobile client exists. |
| 0392 | Consistent Color Generation | Stable | Name colors that match across clients. |
| 0424 | Message Retraction | Experimental | Deleting a message. |
| 0433 | Extended Channel Search | Experimental | Searching public rooms across instances. |
| 0463 | MUC Affiliations Versioning | Experimental | Cheaper member list sync for large guilds. |
| 0482 | Call Invites | Experimental | Inviting someone into a call from a chat. Movim dropped it for group calls. |
| 0503 | Spaces | Experimental | The XSF's own take on grouping rooms. If it matures, the guild manifest could become a Space. |
| 0518 | Payment Required | Experimental | Services that ask for payment before granting access. Relevant to paid guilds or hosted instances. |
