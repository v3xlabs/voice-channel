# Deploying an instance

An instance is one NixOS host with one domain. The flake ships everything: the daemon and
the web client as packages, and a NixOS module that wires Prosody, the daemon, Galene,
coturn, nginx, and certificates together.

## DNS

Point these at the host:

| Record | Purpose |
| --- | --- |
| `A` and `AAAA` for `<domain>` | The web client, the websocket, `host-meta`, XMPP c2s on 5222, s2s on 5269. |
| `A` for `rooms.<domain>`, `pubsub.<domain>`, `upload.<domain>`, `vc.<domain>` | Other servers reach these directly over s2s. |
| `_xmpp-client._tcp.<domain>` SRV 5222 and `_xmpp-server._tcp.<domain>` SRV 5269 | Optional, but other servers try them first. |

The certificate covers the domain and the four subdomains, so all five names must
resolve before the first ACME request.

## Secrets

Two files on the host, readable by root only:

- the component secret shared by Prosody and the daemon,
- the TURN secret shared by Prosody and coturn.

Any random string works. The module reads them at boot and writes environment files under
`/run/voice-channel`. They never enter the Nix store.

## Configuration

```nix
{
  inputs.voice-channel.url = "github:v3xlabs/voice-channel";

  outputs = { nixpkgs, voice-channel, ... }: {
    nixosConfigurations.vc = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        voice-channel.nixosModules.default
        {
          services.voice-channel = {
            enable = true;
            domain = "voice.channel";
            admins = [ "luc@voice.channel" ];
            acmeEmail = "ops@voice.channel";
            componentSecretFile = "/var/keys/voice-channel-component";
            turnSecretFile = "/var/keys/voice-channel-turn";
            publicIp = "203.0.113.1";
          };
          security.acme.acceptTerms = true;
        }
      ];
    };
  };
}
```

## First accounts

Registration is closed. After the first deploy, create the admin account on the host:

```
sudo -u prosody prosodyctl adduser luc@voice.channel
```

Sign into the web client at `https://<domain>` with that account. The admin entry in the
settings menu creates guilds, account invites, and accounts. Invite links open in any
XMPP client that supports XEP-0401, such as Conversations, Monal, or Dino, and produce an
account that then works in the web client too.

## Ports

| Port | Service |
| --- | --- |
| 80, 443 tcp | nginx: web client, websocket, upload, ACME |
| 5222 tcp | XMPP clients |
| 5269 tcp | XMPP federation |
| 3478 tcp and udp, 49152 to 65535 udp | coturn |

Galene, Prosody's HTTP, and the daemon's component port listen on localhost only.
Media flows between browsers and Galene over UDP through coturn's relay range when a
direct path fails.

## What the module does not do yet

- Back up `/var/lib/prosody` and `/var/lib/vcd`. Both hold the instance's state.
- Rotate the Galene participant password; every participant joins Galene with one shared
  password through the daemon, and Galene listens only on localhost.
- Monitor anything. The daemon logs at info level to the journal.
