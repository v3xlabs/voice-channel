root := justfile_directory()
state := root / ".tmp"

default:
    just --list

# Prosody on localhost: websocket at ws://127.0.0.1:5280/xmpp-websocket, c2s on 5222
xmpp:
    mkdir -p {{state}}/prosody/data {{state}}/prosody/certs
    VC_ROOT={{root}} prosody --config {{root}}/dev/prosody.cfg.lua

# Create the development accounts admin, alice, and bob @localhost, password "dev"
seed:
    mkdir -p {{state}}/prosody/data {{state}}/prosody/certs
    VC_ROOT={{root}} prosodyctl --config {{root}}/dev/prosody.cfg.lua register admin localhost dev
    VC_ROOT={{root}} prosodyctl --config {{root}}/dev/prosody.cfg.lua register alice localhost dev
    VC_ROOT={{root}} prosodyctl --config {{root}}/dev/prosody.cfg.lua register bob localhost dev

# Galene SFU on http://127.0.0.1:8443, reached only by vcd
sfu:
    mkdir -p {{state}}/galene/data {{state}}/galene/static
    galene -insecure -http 127.0.0.1:8443 -turn "" \
        -static {{state}}/galene/static \
        -data {{state}}/galene/data \
        -groups {{root}}/dev/galene/groups

# coturn on udp/3478 with the secret prosody hands out over XEP-0215
turn:
    turnserver -n --listening-ip=127.0.0.1 --listening-port=3478 \
        --realm=localhost --use-auth-secret --static-auth-secret=vc-dev-turn-secret \
        --no-tls --no-dtls --no-cli --log-file=stdout

# Web client on http://localhost:5173; localhost JIDs use the Prosody websocket from ui/web/.env.development
web:
    cd {{root}}/ui/web && pnpm vite


# The daemon, attached to the local Prosody as vc.localhost
vcd:
    mkdir -p {{state}}/vcd
    cd {{root}}/vcd && cargo run -- --jid vc.localhost --secret vc-dev-component-secret --domain localhost --admins admin@localhost --data {{state}}/vcd
