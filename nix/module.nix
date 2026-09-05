{ self }:
{ config, lib, pkgs, ... }:
let
  cfg = config.services.voice-channel;
  inherit (lib) mkEnableOption mkOption mkIf types;
  domain = cfg.domain;
  rooms = "rooms.${domain}";
  pubsub = "pubsub.${domain}";
  upload = "upload.${domain}";
  component = "vc.${domain}";
  actor = "vcd@${component}";
  certDir = "/var/lib/acme/${domain}";
  system = pkgs.stdenv.hostPlatform.system;
  vcd = self.packages.${system}.vcd;
  web = self.packages.${system}.web;
  galeneGroups = pkgs.writeTextDir "vc.json" (builtins.toJSON {
    description = "voice.channel rooms: one subgroup per voice channel";
    public = false;
    "auto-subgroups" = true;
    "allow-recording" = false;
    "wildcard-user" = { password = { type = "wildcard"; }; permissions = "present"; };
  });
in
{
  options.services.voice-channel = {
    enable = mkEnableOption "a voice.channel instance: Prosody, the vcd daemon, Galene, coturn, and the web client";

    domain = mkOption {
      type = types.str;
      description = "The instance domain. Accounts are user@domain; rooms, pubsub, upload, and vc are subdomains.";
    };

    admins = mkOption {
      type = types.listOf types.str;
      default = [ ];
      description = "Bare JIDs that administer the instance: they create guilds, invites, and accounts.";
    };

    acmeEmail = mkOption {
      type = types.str;
      description = "Contact for the ACME certificate that covers the domain and its subdomains.";
    };

    componentSecretFile = mkOption {
      type = types.path;
      description = "File holding the shared secret between Prosody and the daemon. Not world readable.";
    };

    turnSecretFile = mkOption {
      type = types.path;
      description = "File holding the TURN REST secret shared by Prosody and coturn.";
    };

    publicIp = mkOption {
      type = types.str;
      description = "The public IPv4 address, used by coturn for relay candidates.";
    };
  };

  config = mkIf cfg.enable {
    networking.firewall = {
      allowedTCPPorts = [ 80 443 5222 5269 3478 ];
      allowedUDPPorts = [ 3478 ];
      allowedUDPPortRanges = [ { from = 49152; to = 65535; } ];
    };

    security.acme.certs.${domain} = {
      email = cfg.acmeEmail;
      extraDomainNames = [ rooms pubsub upload component ];
      group = "voice-channel-certs";
      reloadServices = [ "prosody.service" ];
    };
    users.groups.voice-channel-certs.members = [ "prosody" "nginx" ];

    services.nginx = {
      enable = true;
      recommendedProxySettings = true;
      virtualHosts.${domain} = {
        useACMEHost = domain;
        forceSSL = true;
        locations."/" = {
          root = web;
          tryFiles = "$uri /index.html";
        };
        locations."/xmpp-websocket" = {
          proxyPass = "http://127.0.0.1:5280/xmpp-websocket";
          proxyWebsockets = true;
          extraConfig = "proxy_read_timeout 900s;";
        };
        locations."/.well-known/host-meta" = { proxyPass = "http://127.0.0.1:5280/.well-known/host-meta"; };
        locations."/.well-known/host-meta.json" = { proxyPass = "http://127.0.0.1:5280/.well-known/host-meta.json"; };
      };
      virtualHosts.${upload} = {
        useACMEHost = domain;
        forceSSL = true;
        locations."/" = { proxyPass = "http://127.0.0.1:5280"; extraConfig = "client_max_body_size 64m;"; };
      };
    };

    services.prosody = {
      enable = true;
      admins = cfg.admins ++ [ actor ];
      allowRegistration = false;
      c2sRequireEncryption = true;
      s2sRequireEncryption = true;
      s2sSecureAuth = true;
      httpInterfaces = [ "127.0.0.1" ];
      httpPorts = [ 5280 ];
      modules = {
        admin_adhoc = true;
        bookmarks = true;
        carbons = true;
        cloud_notify = false;
        csi = true;
        dialback = true;
        mam = true;
        pep = true;
        ping = true;
        register = true;
        smacks = true;
        vcard_legacy = true;
        websocket = true;
      };
      extraModules = [ "invites" "invites_adhoc" "invites_register" "turn_external" "csi_simple" "vcard4" "blocklist" "occupant_id" ];
      ssl = { cert = "${certDir}/fullchain.pem"; key = "${certDir}/key.pem"; };
      virtualHosts.${domain} = {
        enabled = true;
        domain = domain;
        ssl = { cert = "${certDir}/fullchain.pem"; key = "${certDir}/key.pem"; };
      };
      muc = [{
        domain = rooms;
        name = "${domain} rooms";
        restrictRoomCreation = "admin";
        roomDefaultPublicJids = true;
        extraModules = [ "muc_mam" ];
        extraConfig = "muc_room_default_persistent = true";
      }];
      httpFileShare = {
        domain = upload;
        http_external_url = "https://${upload}/";
        size_limit = 50 * 1024 * 1024;
      };
      extraConfig = ''
        http_external_url = "https://${domain}/"
        consider_websocket_secure = true
        archive_expires_after = "never"

        turn_external_secret = "$TURN_SECRET"
        turn_external_host = "${domain}"
        turn_external_port = 3478

        Component "${pubsub}" "pubsub"
            name = "${domain} guilds"
            pubsub_max_items = 256

        Component "${component}"
            component_secret = "$COMPONENT_SECRET"
      '';
    };
    # The nixpkgs module runs envsubst over the config; these give it the secrets.
    systemd.services.prosody.serviceConfig.EnvironmentFile = "/run/voice-channel/prosody.env";
    systemd.services.prosody.after = [ "voice-channel-secrets.service" ];
    systemd.services.prosody.requires = [ "voice-channel-secrets.service" ];

    systemd.services.voice-channel-secrets = {
      description = "Render the voice.channel secret environment files";
      wantedBy = [ "multi-user.target" ];
      serviceConfig = { Type = "oneshot"; RemainAfterExit = true; RuntimeDirectory = "voice-channel"; RuntimeDirectoryMode = "0750"; };
      script = ''
        umask 077
        printf 'COMPONENT_SECRET=%s\nTURN_SECRET=%s\n' "$(cat ${cfg.componentSecretFile})" "$(cat ${cfg.turnSecretFile})" > /run/voice-channel/prosody.env
        printf 'VCD_SECRET=%s\n' "$(cat ${cfg.componentSecretFile})" > /run/voice-channel/vcd.env
        printf 'static-auth-secret=%s\n' "$(cat ${cfg.turnSecretFile})" > /run/voice-channel/turn.conf
        chgrp prosody /run/voice-channel/prosody.env; chmod 640 /run/voice-channel/prosody.env
        chgrp turnserver /run/voice-channel/turn.conf; chmod 640 /run/voice-channel/turn.conf
      '';
    };

    services.galene = {
      enable = true;
      insecure = true;
      httpAddress = "127.0.0.1";
      httpPort = 8443;
      turnAddress = "";
      groupsDir = galeneGroups;
      staticDir = pkgs.emptyDirectory;
    };

    services.coturn = {
      enable = true;
      realm = domain;
      listening-port = 3478;
      no-cli = true;
      no-tls = true;
      no-dtls = true;
      lt-cred-mech = true;
      min-port = 49152;
      max-port = 65535;
      extraConfig = ''
        use-auth-secret
        external-ip=${cfg.publicIp}
        no-multicast-peers
        no-loopback-peers
      '';
    };
    systemd.services.coturn.serviceConfig.ExecStart = lib.mkForce "${pkgs.coturn}/bin/turnserver -c /run/coturn/turnserver.cfg -c /run/voice-channel/turn.conf";
    systemd.services.coturn.after = [ "voice-channel-secrets.service" ];
    systemd.services.coturn.requires = [ "voice-channel-secrets.service" ];

    systemd.services.vcd = {
      description = "voice.channel daemon";
      wantedBy = [ "multi-user.target" ];
      after = [ "prosody.service" "galene.service" "voice-channel-secrets.service" ];
      requires = [ "prosody.service" "voice-channel-secrets.service" ];
      environment = {
        VCD_JID = component;
        VCD_DOMAIN = domain;
        VCD_SERVER = "127.0.0.1:5347";
        VCD_GALENE = "ws://127.0.0.1:8443/ws";
        VCD_DATA = "/var/lib/vcd";
        VCD_ADMINS = lib.concatStringsSep "," cfg.admins;
        RUST_LOG = "vcd=info";
      };
      serviceConfig = {
        ExecStart = "${vcd}/bin/vcd";
        EnvironmentFile = "/run/voice-channel/vcd.env";
        DynamicUser = true;
        StateDirectory = "vcd";
        Restart = "always";
        RestartSec = 3;
      };
    };
  };
}
