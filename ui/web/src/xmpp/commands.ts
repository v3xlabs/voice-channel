import type { Agent } from 'stanza';

/** The daemon's Ad-Hoc commands are single stage: submit the form, read the note. */
export type CommandField = { name: string; value: string };

export type CommandOutcome =
    | { ok: true; note: string }
    | { ok: false; error: string };

export const runCommand = async (client: Agent, component: string, node: string, fields: CommandField[]): Promise<CommandOutcome> => {
    try {
        const result = await client.sendIQ({
            to: component,
            type: 'set',
            command: {
                node,
                action: 'complete',
                form: {
                    type: 'submit',
                    fields: [{ name: 'FORM_TYPE', type: 'hidden', value: node }, ...fields],
                },
            },
        });
        const reply = result.command;
        const note = reply?.notes?.map((entry) => entry.value ?? '').join(' ') ?? '';
        return reply?.status === 'completed' ? { ok: true, note } : { ok: false, error: note || 'command did not complete' };
    } catch (error) {
        const err = error as { error?: { condition?: string; text?: string } };
        return { ok: false, error: err.error?.text ?? err.error?.condition ?? 'request failed' };
    }
};

export const guildCommand = (name: string) => `urn:voice.channel:guild#${name}`;
export const instanceCommand = (name: string) => `urn:voice.channel:instance#${name}`;
