# Deploying an instance

An instance is one domain. The flake ships the daemon and the web client as packages and a
NixOS module, `services.voice-channel`, that wires Prosody, the daemon, Galene, coturn,
nginx, and certificates together. Every piece has an enable switch, every value the module
sets on another service is a default you can override, and the firewall is opt in.

## DNS

Point these at the host:

| Record | Purpose |
| --- | --- |
| `A` and `AAAA` for `<domain>` | The web client, the websocket, `host-meta`, XMPP c2s on 5222, s2s on 5269. |
| `A` for `rooms.<domain>`, `pubsub.<domain>`, `upload.<domain>`, `vc.<domain>` | Other servers reach these directly over s2s. |
| `_xmpp-client._tcp.<domain>` SRV 5222 and `_xmpp-server._tcp.<domain>` SRV 5269 | Optional, but other servers try them first. |

## Secrets

Two files on the host, readable by root only: the component secret shared by Prosody and
the daemon, and the TURN secret shared by Prosody and coturn. Any random string works.
The module reads them at boot into environment files under `/run/voice-channel`. They
never enter the Nix store.

## The smallest configuration

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
            certificates.email = "ops@voice.channel";
            componentSecretFile = "/var/keys/voice-channel-component";
            turn.secretFile = "/var/keys/voice-channel-turn";
            openFirewall = true;
          };
          security.acme.acceptTerms = true;
        }
      ];
    };
  };
}
```

This runs everything on one host: Prosody with a module-created ACME certificate for the
domain and its four subdomains, the daemon, Galene on localhost, coturn on 3478, and nginx
serving the client and proxying the websocket, `host-meta`, and uploads.

## Taking control

Each of these is independent of the others.

**Certificates.** Three choices. Leave `certificates` alone and the module creates one
ACME certificate covering the five names. Set `certificates.useACMEHost = "wild"` to reuse
an existing `security.acme.certs.wild`, for example a wildcard. Set `certificates.certFile`
and `certificates.keyFile` to files you manage yourself; Prosody and nginx read them as they
are, and nothing reloads them for you.

**Prosody.** The module configures `services.prosody`. Everything it sets is a default, so
your own `services.prosody.*` settings win, and `services.prosody.extraConfig` appends. Set
`prosody.enable = false` to run your own Prosody; it must then provide the `rooms`, `pubsub`,
and `upload` components, the `vc` component with the shared secret on
`prosody.componentPort`, and the modules listed in `docs/profile.md`.

**nginx.** Set `nginx.enable = false` and proxy these yourself to
`127.0.0.1:<prosody.httpPort>`: `/xmpp-websocket` with websocket upgrade and a long read
timeout, `/.well-known/host-meta` and `host-meta.json`, and the whole `upload.<domain>`
host. Serve the client, `nginx.web.package`, from any static server. To keep nginx but
serve the client elsewhere, set `nginx.web.enable = false`. Ports and other nginx
settings come from `services.nginx` as usual.

**TURN.** Set `turn.enable = false` and `turn.host`, `turn.port`, `turn.secretFile` to
have Prosody hand out credentials for a TURN server elsewhere. Behind NAT on this host,
set `turn.publicIp`. `turn.relayPorts` bounds the UDP relay range.

**Galene.** Set `galene.enable = false` and `daemon.extraEnvironment.VCD_GALENE` to a
websocket URL for a Galene elsewhere. The daemon expects a group named `vc` with
`auto-subgroups` and a wildcard user with `present` permission, as in
`dev/galene/groups/vc.json`.

**The daemon.** `daemon.package`, `daemon.dataDir`, `daemon.logLevel`, and
`daemon.extraEnvironment`. The daemon runs as a dynamic user with a state directory and
restarts on exit.

**Firewall.** `openFirewall` opens only the ports of the services that are enabled. Leave
it off to manage the firewall yourself.

## First accounts

Registration is closed. After the first deploy, create the admin account on the host:

```
sudo -u prosody prosodyctl adduser luc@voice.channel
```

Sign into the web client with that account. Because the JID is in `admins`, the settings
menu shows the admin page, which creates guilds, account invites, and accounts.

Every invite is one token in two forms. `https://<domain>/invite/<token>` is a page of the
web client: the recipient picks a username and a password there, and lands signed in.
`xmpp:<domain>?register;preauth=<token>` is the same invite for any XMPP client that
supports XEP-0401. Either produces an account that works everywhere. The token is spent by
the first account it creates.

`prosodyctl shell invite create_account <domain>` makes one from the host, and prints the
web link because the module sets Prosody's `invites_page` to it.

## Ports

| Port | Service |
| --- | --- |
| 80, 443 tcp | nginx: web client, websocket, upload, ACME |
| 5222 tcp | XMPP clients |
| 5269 tcp | XMPP federation |
| 3478 tcp and udp, 49152 to 65535 udp | coturn |

Galene, Prosody's HTTP, and the daemon's component port listen on localhost only.

## What the module does not do yet

- Back up `/var/lib/prosody` and `/var/lib/vcd`. Both hold the instance's state.
- Rotate the Galene participant password; every participant joins Galene with one shared
  password through the daemon, and Galene listens only on localhost.
- Monitor anything. The daemon logs to the journal at `daemon.logLevel`.
