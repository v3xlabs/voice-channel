-- Local development instance. Plaintext, single host, no s2s.
-- Started by `just xmpp` from the repository root.

local root = Lua.os.getenv("VC_ROOT") or "."
local state = root .. "/.tmp/prosody"

data_path = state .. "/data"
pidfile = state .. "/prosody.pid"
certificates = state .. "/certs"
log = { { levels = { min = Lua.os.getenv("VC_LOG") or "info" }, to = "console" } }

admins = { "admin@localhost"; "vcd@vc.localhost" }

modules_enabled = {
    "disco";
    "roster";
    "saslauth";
    "tls";
    "dialback";
    "carbons";
    "pep";
    "private";
    "blocklist";
    "vcard4";
    "vcard_legacy";
    "version";
    "uptime";
    "time";
    "ping";
    "register";
    "mam";
    "csi_simple";
    "smacks";
    "bookmarks";
    "websocket";
    "http";
    "turn_external";
    "invites";
    "invites_adhoc";
    "invites_register";
    "admin_adhoc";
    "admin_shell";
}

modules_disabled = { "s2s" }

allow_registration = false
c2s_require_encryption = false
s2s_require_encryption = false
authentication = "internal_hashed"

http_ports = { 5280 }
http_interfaces = { "127.0.0.1" }
https_ports = {}
consider_websocket_secure = true

archive_expires_after = "never"

-- coturn from `just turn` shares this secret.
turn_external_secret = "vc-dev-turn-secret"
turn_external_host = "127.0.0.1"
turn_external_port = 3478

VirtualHost "localhost"

Component "rooms.localhost" "muc"
    name = "voice.channel rooms"
    modules_enabled = { "muc_mam" }
    restrict_room_creation = true
    muc_room_default_persistent = true
    muc_room_default_public = true
    muc_room_default_members_only = false
    muc_room_default_public_jids = true
    muc_room_default_allow_member_invites = false

Component "pubsub.localhost" "pubsub"
    name = "voice.channel guilds"
    pubsub_max_items = 256

Component "upload.localhost" "http_file_share"
    name = "voice.channel upload"
    http_file_share_size_limit = 50 * 1024 * 1024

-- vcd attaches here over XEP-0114.
Component "vc.localhost"
    component_secret = "vc-dev-component-secret"
