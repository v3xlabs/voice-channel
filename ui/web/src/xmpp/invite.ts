/** A XEP-0401 account invite: the instance to register on, and the one-time token. */
export type Invite = {
    domain: string;
    token: string;
};

const ACCOUNT_INVITE = /^xmpp:([^?/]+)\?register;preauth=([^;]+)$/;

export const parseInviteUri = (uri: string): Invite | undefined => {
    const match = ACCOUNT_INVITE.exec(uri.trim());
    if (!match) return undefined;
    const [, domain, token] = match;
    return { domain, token };
};

export const inviteUri = ({ domain, token }: Invite): string => `xmpp:${domain}?register;preauth=${token}`;

/**
 * The invite page is the instance's own web client, which is normally the page building
 * this link. The desktop app has no web origin, so it names the instance instead.
 */
export const inviteLink = ({ domain, token }: Invite): string =>
    `${location.hostname === domain ? location.origin : `https://${domain}`}/invite/${token}`;
