{
  description = "voice.channel: a Discord-shaped experience on plain XMPP";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem (system: let
      pkgs = import nixpkgs {
        inherit system;
      };
    in {
      packages = {
        vcd = pkgs.rustPlatform.buildRustPackage {
          pname = "vcd";
          version = "0.1.0";
          src = ./vcd;
          cargoLock.lockFile = ./vcd/Cargo.lock;
          meta.description = "voice.channel daemon: guild manifests and the conference service, as an XMPP component";
        };

        web = pkgs.stdenv.mkDerivation (finalAttrs: {
          pname = "voice-channel-web";
          version = "0.0.1";
          src = ./ui/web;
          nativeBuildInputs = [pkgs.nodejs_24 pkgs.pnpm_11.configHook];
          # The lockfile was written with peer auto-install off, as the devshell sets it.
          pnpmInstallFlags = ["--config.auto-install-peers=false"];
          pnpmDeps = pkgs.fetchPnpmDeps {
            inherit (finalAttrs) pname version src pnpmInstallFlags;
            pnpm = pkgs.pnpm_11;
            fetcherVersion = 4;
            hash = "sha256-7/BIUkYywqCF4foCgFPsYPWmUE4078wYydmgUuC6e1g=";
          };
          # Calling vite directly avoids pnpm re-running install before the script.
          buildPhase = ''
            runHook preBuild
            node_modules/.bin/vite build
            runHook postBuild
          '';
          installPhase = ''
            runHook preInstall
            cp -r dist $out
            runHook postInstall
          '';
          meta.description = "voice.channel web client, built for a static web server";
        });

        default = self.packages.${system}.vcd;
      };

      devShells.default = pkgs.mkShell {
        packages = with pkgs; [
          just
          cargo
          rustc
          rustfmt
          clippy
          nodejs_24
          pnpm_11
          pkg-config
          prosody
          galene
          coturn
        ];

        shellHook = ''
          export pnpm_config_auto_install_peers=false
          export pnpm_config_ignore_scripts=true
          just
        '';
      };
    })
    // {
      nixosModules.default = import ./nix/module.nix {inherit self;};
      nixosModules.voice-channel = self.nixosModules.default;
    };
}
