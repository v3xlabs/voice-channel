// Runs one vcd Ad-Hoc command as a local user, until the client has a UI for them.
// Usage, from ui/web:
//   node scripts/guild.ts <user> <command> [field=value ...]
//   node scripts/guild.ts alice create slug=labs name="V3X Labs" description="Where the tools get built."
//   node scripts/guild.ts alice channels slug=labs action=add category=Voice kind=voice name=Lounge
//   node scripts/guild.ts admin join slug=labs
//   node scripts/guild.ts admin instance#invite
//   node scripts/guild.ts admin instance#account username=carol password=dev
// Commands: create, join, leave, channels, members, delete, instance#invite, instance#account. Password is "dev".
import { createClient } from 'stanza';

const [user, command, ...pairs] = process.argv.slice(2);
if (!user || !command) {
    console.error('usage: node scripts/guild.ts <user> <command> [field=value ...]');
    process.exit(2);
}

const DOMAIN = 'localhost';
const COMPONENT = `vc.${DOMAIN}`;

const node = command.includes('#') ? `urn:voice.channel:${command}` : `urn:voice.channel:guild#${command}`;
const fields = pairs.map((pair) => {
    const index = pair.indexOf('=');
    return { name: pair.slice(0, index), value: pair.slice(index + 1) };
});

const client = createClient({
    jid: `${user}@${DOMAIN}`,
    password: 'dev',
    transports: { websocket: `ws://127.0.0.1:5280/xmpp-websocket`, bosh: false },
});

client.on('session:started', async () => {
    try {
        const result = await client.sendIQ({
            to: COMPONENT,
            type: 'set',
            command: {
                node: node,
                action: 'complete',
                form: {
                    type: 'submit',
                    fields: [{ name: 'FORM_TYPE', type: 'hidden', value: node }, ...fields],
                },
            },
        });
        const reply = result.command;
        console.log(reply?.status, reply?.notes?.map((note) => note.value).join(' ') ?? '');
        process.exit(reply?.status === 'completed' ? 0 : 1);
    } catch (error) {
        const err = error as { error?: { condition?: string; text?: string } };
        console.error('error', err.error?.condition, err.error?.text ?? '');
        process.exit(1);
    }
});

client.on('auth:failed', () => {
    console.error('login failed for', user);
    process.exit(1);
});

client.connect();
setTimeout(() => {
    console.error('timed out');
    process.exit(1);
}, 20000);

