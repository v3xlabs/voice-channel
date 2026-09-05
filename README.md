# voice.channel

A Discord-shaped experience on plain XMPP. Guilds, text channels, and voice channels
you can walk into, on any instance, reachable from any XMPP client.

- `docs/profile.md` is the contract between an instance and a client.
- `docs/xeps.md` lists every extension we target and what it does for us.
- `docs/deploy.md` explains the NixOS module that runs an instance.
- `nix/module.nix` is that module; `flake.nix` exports it with the `vcd` and `web` packages.
- `ui/web` is the web and desktop client.
- `dev/` holds the local instance configuration.

## Local instance

Enter the devshell with `nix develop`, then in separate terminals:

```
just seed        # once: creates admin, alice, and bob @localhost, password "dev"
just xmpp        # Prosody
just vcd         # the daemon, as the vc.localhost component
just sfu         # Galene
just turn        # coturn
just web         # the client on http://localhost:5173
```

Log in with `alice@localhost` and `dev`. The accounts button beside the settings button
adds more accounts and switches between them. Every account stays connected.

Guilds, invites, and accounts are created through the daemon's Ad-Hoc commands. In the
client, the admin entry of the settings menu and each guild's overview page run them.
`ui/web/scripts/guild.ts` runs one command from a terminal:

```
cd ui/web
node scripts/guild.ts alice create slug=labs name="Labs"
node scripts/guild.ts alice channels slug=labs action=add category=Voice kind=voice name=Lounge
node scripts/guild.ts admin join slug=labs
```
