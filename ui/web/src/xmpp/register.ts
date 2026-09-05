import { createClient } from 'stanza';
import { attribute } from 'stanza/jxt/index.js';
import type { DefinitionOptions } from 'stanza/jxt/index.js';

import type { Invite } from './invite';
import { websocketFor } from './transport';

const NS_PREAUTH = 'urn:xmpp:pars:0';

declare module 'stanza/protocol' {
    interface IQPayload {
        preauth?: { token: string };
    }
}

/** XEP-0379: the token that lets an otherwise closed instance accept a registration. */
const PreauthProtocol: DefinitionOptions = {
    element: 'preauth',
    namespace: NS_PREAUTH,
    path: 'iq.preauth',
    fields: {
        token: attribute('token'),
    },
};

export type Registration = { ok: true } | { ok: false; error: string };

const ANSWER_TIMEOUT_MS = 20_000;

/** stanza rejects with the error stanza; Prosody explains each of these failures in it. */
const failureText = (error: unknown): string => {
    const detail = error instanceof Object && 'error' in error ? error.error : undefined;
    if (detail instanceof Object && 'text' in detail && typeof detail.text === 'string') return detail.text;
    return 'the instance refused the registration';
};

/**
 * XEP-0401 account creation: present the invite token on an unauthenticated stream, then
 * register in band. Feature negotiation halts at in-band registration, because the
 * handler never reports back, so this stream never reaches SASL and never binds.
 */
export const registerWithInvite = (invite: Invite, username: string, password: string): Promise<Registration> => {
    const websocket = websocketFor(invite.domain);
    const client = createClient({
        jid: invite.domain,
        autoReconnect: false,
        useStreamManagement: false,
        ...(websocket ? { transports: { websocket, bosh: false } } : {}),
    });
    client.stanzas.define(PreauthProtocol);

    return new Promise<Registration>((resolve) => {
        let isSettled = false;
        const finish = (registration: Registration) => {
            if (isSettled) return;
            isSettled = true;
            clearTimeout(answerTimeout);
            client.disconnect();
            resolve(registration);
        };
        const answerTimeout = setTimeout(
            () => finish({ ok: false, error: `${invite.domain} did not answer` }),
            ANSWER_TIMEOUT_MS
        );

        client.registerFeature('inbandRegistration', 50, async () => {
            try {
                await client.sendIQ({ type: 'set', preauth: { token: invite.token } });
                await client.sendIQ({ type: 'set', account: { username, password } });
                finish({ ok: true });
            } catch (error) {
                finish({ ok: false, error: failureText(error) });
            }
        });

        client.on('features', (features) => {
            if (!features.inbandRegistration) finish({ ok: false, error: `${invite.domain} is not accepting invites` });
        });
        client.on('disconnected', () => finish({ ok: false, error: `could not reach ${invite.domain}` }));

        client.connect();
    });
};
