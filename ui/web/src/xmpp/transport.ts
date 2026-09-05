/**
 * Where a domain's XMPP websocket lives. Anywhere but development that is host-meta
 * discovery, which stanza does itself; the development instance is plaintext, and
 * discovery keeps only `wss:` and `https:` endpoints.
 */
export const websocketFor = (domain: string): string | undefined =>
    domain === 'localhost' || domain.endsWith('.localhost') ? import.meta.env.VITE_XMPP_WEBSOCKET : undefined;
