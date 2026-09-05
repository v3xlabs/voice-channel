{ self }:
{ config, lib, pkgs, ... }:
let
  cfg = config.services.voice-channel;
  inherit (lib) mkEnableOption mkOption mkIf mkDefault mkMerge types optional optionals;
  domain = cfg.domain;
  rooms = "rooms.${domain}";
  pubsub = "pubsub.${domain}";
  upload = "upload.${domain}";
  component = "vc.${domain}";
  actor = "vcd@${component}";
  system = pkgs.stdenv.hostPlatform.system;

  # Where the certificate for the domain and its subdomains comes from.
  ownCerts = cfg.certificates.certFile != null;
  acmeHost = if cfg.certificates.useACMEHost != null then cfg.certificates.useACMEHost else domain;
  createAcme = !ownCerts && cfg.certificates.useACMEHost == null;
  certFile = if ownCerts then cfg.certificates.certFile else "/var/lib/acme/${acmeHost}/fullchain.pem";
  keyFile = if ownCerts then cfg.certificates.keyFile else "/var/lib/acme/${acmeHost}/key.pem";

  galeneGroups = pkgs.writeTextDir "vc.json" (builtins.toJSON {
    description = "voice.channel rooms: one subgroup per voice channel";
    public = false;
    "auto-subgroups" = true;
    "allow-recording" = false;
    "wildcard-user" = { password = { type = "wildcard"; }; permissions = "present"; };
  });

  turnConfigured = cfg.turn.enable || cfg.turn.host != null;
in
{
  options.services.voice-channel = {
    enable = mkEnableOption "a voice.channel instance";

    domain = mkOption {
      type = types.str;
      description = "The instance domain. Accounts are user@domain; rooms, pubsub, upload, and vc are subdomains.";
    };

    admins = mkOption {
      type = types.listOf types.str;
      default = [ ];
      description = "Bare JIDs that administer the instance: they create guilds, invites, and accounts.";
    };

    openFirewall = mkOption {
      type = types.bool;
      default = false;
      description = "Open the ports of every enabled service: 5222 and 5269 for XMPP, 3478 and the relay range for TURN, 80 and 443 for nginx.";
    };

    certificates = {
      certFile = mkOption {
        type = types.nullOr types.path;
        default = null;
        description = "Full chain certificate for the domain and its subdomains, managed outside this module. Sets keyFile too.";
      };
      keyFile = mkOption {
        type = types.nullOr types.path;
        default = null;
        description = "Private key for certFile.";
      };
      useACMEHost = mkOption {
        type = types.nullOr types.str;
        default = null;
        description = "An existing security.acme.certs entry to reuse, for example a wildcard. When null and certFile is null, the module creates one for the domain and its subdomains.";
      };
      email = mkOption {
        type = types.nullOr types.str;
        default = null;
        description = "ACME contact, needed only when the module creates the certificate.";
      };
    };

    componentSecretFile = mkOption {
      type = types.path;
      description = "File holding the shared secret between Prosody and the daemon. Root readable only; it is copied into runtime environment files.";
    };

    prosody = {
      enable = mkOption {
        type = types.bool;
        default = true;
        description = "Configure services.prosody for this instance. Every value is a default you can override; disable to run your own Prosody that provides the same components.";
      };
      httpPort = mkOption {
        type = types.port;
        default = 5280;
        description = "Prosody's local HTTP port: the websocket, host-meta, and uploads. Proxy it yourself when nginx is disabled.";
      };
      componentPort = mkOption {
        type = types.port;
        default = 5347;
        description = "The XEP-0114 port the daemon connects to.";
      };
    };

    daemon = {
      package = mkOption {
        type = types.package;
        default = self.packages.${system}.vcd;
        description = "The vcd package.";
      };
      dataDir = mkOption {
        type = types.str;
        default = "/var/lib/vcd";
        description = "Where the daemon keeps guild state.";
      };
      logLevel = mkOption {
        type = types.str;
        default = "vcd=info";
        description = "RUST_LOG for the daemon.";
      };
      extraEnvironment = mkOption {
        type = types.attrsOf types.str;
        default = { };
        description = "Extra environment for the daemon, for example VCD_GALENE for an external SFU.";
      };
    };

    galene = {
      enable = mkOption {
        type = types.bool;
        default = true;
        description = "Run Galene on localhost as the SFU. Disable and set daemon.extraEnvironment.VCD_GALENE to use one elsewhere.";
      };
      port = mkOption {
        type = types.port;
        default = 8443;
        description = "Galene's local HTTP port.";
      };
    };

    turn = {
      enable = mkOption {
        type = types.bool;
        default = true;
        description = "Run coturn here. Disable to point Prosody at another TURN server through host, port, and secretFile.";
      };
      host = mkOption {
        type = types.nullOr types.str;
        default = null;
        description = "TURN host that Prosody hands to clients. Defaults to the domain when coturn runs here.";
      };
      port = mkOption {
        type = types.port;
        default = 3478;
        description = "TURN port.";
      };
      secretFile = mkOption {
        type = types.nullOr types.path;
        default = null;
        description = "File holding the TURN REST secret shared by Prosody and the TURN server. Required when turn.enable or turn.host is set.";
      };
      publicIp = mkOption {
        type = types.nullOr types.str;
        default = null;
        description = "Public IPv4 address coturn announces as its relay address. Leave null on a host with a public address.";
      };
      relayPorts = mkOption {
        type = types.submodule { options = { from = mkOption { type = types.port; default = 49152; }; to = mkOption { type = types.port; default = 65535; }; }; };
        default = { };
        description = "UDP relay port range for coturn.";
      };
    };

    nginx = {
      enable = mkOption {
        type = types.bool;
        default = true;
        description = "Configure services.nginx with virtual hosts for the domain and the upload subdomain. Disable to use your own reverse proxy.";
      };
      web.enable = mkOption {
        type = types.bool;
        default = true;
        description = "Serve the web client at the domain root.";
      };
      web.package = mkOption {
        type = types.package;
        default = self.packages.${system}.web;
        description = "The built web client.";
      };
    };
  };

  config = mkIf cfg.enable (mkMerge [
    {
      assertions = [
        {
          assertion = (cfg.certificates.certFile == null) == (cfg.certificates.keyFile == null);
          message = "services.voice-channel.certificates: set certFile and keyFile together.";
        }
        {
          assertion = !createAcme || cfg.certificates.email != null;
          message = "services.voice-channel.certificates.email is required when the module creates the ACME certificate.";
        }
        {
          assertion = !turnConfigured || cfg.turn.secretFile != null;
          message = "services.voice-channel.turn.secretFile is required when TURN is enabled or turn.host is set.";
        }
      ];

      networking.firewall = mkIf cfg.openFirewall {
        allowedTCPPorts = optionals cfg.prosody.enable [ 5222 5269 ] ++ optionals cfg.nginx.enable [ 80 443 ] ++ optional cfg.turn.enable cfg.turn.port;
        allowedUDPPorts = optional cfg.turn.enable cfg.turn.port;
        allowedUDPPortRanges = optional cfg.turn.enable { inherit (cfg.turn.relayPorts) from to; };
      };

      # Secrets are read at boot into runtime files the services can load. Nothing enters the store.
      systemd.services.voice-channel-secrets = {
        description = "Render the voice.channel secret environment files";
        wantedBy = [ "multi-user.target" ];
        serviceConfig = { Type = "oneshot"; RemainAfterExit = true; RuntimeDirectory = "voice-channel"; RuntimeDirectoryMode = "0750"; };
        script = ''
          umask 077
          component="$(cat ${cfg.componentSecretFile})"
          turn="${lib.optionalString turnConfigured "$(cat ${cfg.turn.secretFile})"}"
          printf 'COMPONENT_SECRET=%s\nTURN_SECRET=%s\n' "$component" "$turn" > /run/voice-channel/prosody.env
          printf 'VCD_SECRET=%s\n' "$component" > /run/voice-channel/vcd.env
          ${lib.optionalString cfg.turn.enable ''
            printf 'static-auth-secret=%s\n' "$turn" > /run/voice-channel/turn.conf
            chgrp turnserver /run/voice-channel/turn.conf; chmod 640 /run/voice-channel/turn.conf
          ''}
          ${lib.optionalString cfg.prosody.enable ''
            chgrp prosody /run/voice-channel/prosody.env; chmod 640 /run/voice-channel/prosody.env
          ''}
        '';
      };

      systemd.services.vcd = {
        description = "voice.channel daemon";
        wantedBy = [ "multi-user.target" ];
        after = [ "voice-channel-secrets.service" ] ++ optional cfg.prosody.enable "prosody.service" ++ optional cfg.galene.enable "galene.service";
        requires = [ "voice-channel-secrets.service" ];
        environment = {
          VCD_JID = component;
          VCD_DOMAIN = domain;
          VCD_SERVER = "127.0.0.1:${toString cfg.prosody.componentPort}";
          VCD_GALENE = "ws://127.0.0.1:${toString cfg.galene.port}/ws";
          VCD_DATA = cfg.daemon.dataDir;
          VCD_ADMINS = lib.concatStringsSep "," cfg.admins;
          RUST_LOG = cfg.daemon.logLevel;
        } // cfg.daemon.extraEnvironment;
        serviceConfig = {
          ExecStart = "${cfg.daemon.package}/bin/vcd";
          EnvironmentFile = "/run/voice-channel/vcd.env";
          DynamicUser = true;
          StateDirectory = mkIf (cfg.daemon.dataDir == "/var/lib/vcd") "vcd";
          Restart = "always";
          RestartSec = 3;
        };
      };
    }

    (mkIf createAcme {
      security.acme.certs.${domain} = {
        email = cfg.certificates.email;
        extraDomainNames = [ rooms pubsub upload component ];
        group = mkDefault "voice-channel-certs";
        reloadServices = optional cfg.prosody.enable "prosody.service";
      };
      users.groups.voice-channel-certs.members = optional cfg.prosody.enable "prosody" ++ optional cfg.nginx.enable "nginx";
    })

    (mkIf cfg.prosody.enable {
      services.prosody = {
        enable = true;
        admins = cfg.admins ++ [ actor ];
        allowRegistration = mkDefault false;
        c2sRequireEncryption = mkDefault true;
        s2sRequireEncryption = mkDefault true;
        s2sSecureAuth = mkDefault true;
        httpInterfaces = mkDefault [ "127.0.0.1" ];
        httpPorts = mkDefault [ cfg.prosody.httpPort ];
        modules = {
          admin_adhoc = mkDefault true;
          bookmarks = mkDefault true;
          carbons = mkDefault true;
          csi = mkDefault true;
          dialback = mkDefault true;
          mam = mkDefault true;
          pep = mkDefault true;
          ping = mkDefault true;
          register = mkDefault true;
          smacks = mkDefault true;
          vcard_legacy = mkDefault true;
          websocket = mkDefault true;
        };
        extraModules = [ "invites" "invites_adhoc" "invites_register" "vcard4" "blocklist" "occupant_id" ] ++ optional turnConfigured "turn_external";
        ssl = mkDefault { cert = certFile; key = keyFile; };
        virtualHosts.${domain} = {
          enabled = true;
          domain = domain;
          ssl = mkDefault { cert = certFile; key = keyFile; };
        };
        muc = [{
          domain = rooms;
          name = mkDefault "${domain} rooms";
          restrictRoomCreation = "admin";
          roomDefaultPublicJids = true;
          extraModules = [ "muc_mam" ];
          extraConfig = "muc_room_default_persistent = true";
        }];
        httpFileShare = {
          domain = upload;
          http_external_url = mkDefault "https://${upload}/";
          size_limit = mkDefault (50 * 1024 * 1024);
        };
        extraConfig = ''
          http_external_url = "https://${domain}/"
          consider_websocket_secure = true
          -- Matches the web client's invite route; changing one means changing the other.
          invites_page = "https://${domain}/invite/{invite.token}"
          archive_expires_after = "never"
          ${lib.optionalString turnConfigured ''
            turn_external_secret = "$TURN_SECRET"
            turn_external_host = "${if cfg.turn.host != null then cfg.turn.host else domain}"
            turn_external_port = ${toString cfg.turn.port}
          ''}

          Component "${pubsub}" "pubsub"
              name = "${domain} guilds"
              pubsub_max_items = 256

          Component "${component}"
              component_secret = "$COMPONENT_SECRET"
        '';
      };
      # The nixpkgs module runs envsubst over the config; this file supplies the secrets.
      systemd.services.prosody = {
        serviceConfig.EnvironmentFile = "/run/voice-channel/prosody.env";
        after = [ "voice-channel-secrets.service" ];
        requires = [ "voice-channel-secrets.service" ];
      };
    })

    (mkIf cfg.galene.enable {
      services.galene = {
        enable = true;
        insecure = true;
        httpAddress = "127.0.0.1";
        httpPort = cfg.galene.port;
        turnAddress = mkDefault "";
        groupsDir = mkDefault galeneGroups;
        staticDir = mkDefault pkgs.emptyDirectory;
      };
    })

    (mkIf cfg.turn.enable {
      services.coturn = {
        enable = true;
        realm = mkDefault domain;
        listening-port = cfg.turn.port;
        no-cli = mkDefault true;
        no-tls = mkDefault true;
        no-dtls = mkDefault true;
        lt-cred-mech = true;
        min-port = cfg.turn.relayPorts.from;
        max-port = cfg.turn.relayPorts.to;
        extraConfig = ''
          use-auth-secret
          no-multicast-peers
          no-loopback-peers
          ${lib.optionalString (cfg.turn.publicIp != null) "external-ip=${cfg.turn.publicIp}"}
        '';
      };
      # The secret lives in a runtime file rather than the store-resident config.
      systemd.services.coturn = {
        serviceConfig.ExecStart = lib.mkForce "${pkgs.coturn}/bin/turnserver -c /run/coturn/turnserver.cfg -c /run/voice-channel/turn.conf";
        after = [ "voice-channel-secrets.service" ];
        requires = [ "voice-channel-secrets.service" ];
      };
    })

    (mkIf cfg.nginx.enable {
      services.nginx = {
        enable = true;
        recommendedProxySettings = mkDefault true;
        virtualHosts.${domain} = mkMerge [
          (if ownCerts then { sslCertificate = certFile; sslCertificateKey = keyFile; } else { useACMEHost = acmeHost; })
          {
            forceSSL = mkDefault true;
            locations."/xmpp-websocket" = {
              proxyPass = "http://127.0.0.1:${toString cfg.prosody.httpPort}/xmpp-websocket";
              proxyWebsockets = true;
              extraConfig = "proxy_read_timeout 900s;";
            };
            locations."/.well-known/host-meta" = { proxyPass = "http://127.0.0.1:${toString cfg.prosody.httpPort}/.well-known/host-meta"; };
            locations."/.well-known/host-meta.json" = { proxyPass = "http://127.0.0.1:${toString cfg.prosody.httpPort}/.well-known/host-meta.json"; };
          }
          (mkIf cfg.nginx.web.enable {
            locations."/" = {
              root = cfg.nginx.web.package;
              tryFiles = "$uri /index.html";
            };
          })
        ];
        virtualHosts.${upload} = mkMerge [
          (if ownCerts then { sslCertificate = certFile; sslCertificateKey = keyFile; } else { useACMEHost = acmeHost; })
          {
            forceSSL = mkDefault true;
            locations."/" = { proxyPass = "http://127.0.0.1:${toString cfg.prosody.httpPort}"; extraConfig = "client_max_body_size 64m;"; };
          }
        ];
      };
    })
  ]);
}
