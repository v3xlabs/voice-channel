const STORAGE_PREFIX = '@vc/xmpp';
const TAB_ID_SESSION_KEY = `${STORAGE_PREFIX}:tab-id`;

type AccountLock = {
    tabId: string;
    expiresAt: number;
};

export const getTabId = (): string => {
    let id = sessionStorage.getItem(TAB_ID_SESSION_KEY);
    if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem(TAB_ID_SESSION_KEY, id);
    }
    return id;
};

export const acquireAccountLock = async (
    accountJid: string,
    name: string,
    ttlMs: number,
    waitMs = ttlMs
): Promise<boolean> => {
    const lockKey = accountKey(accountJid, name);
    const tabId = getTabId();
    const deadline = Date.now() + waitMs;

    while (Date.now() < deadline) {
        const now = Date.now();
        const existing = parseJSON<AccountLock | null>(localStorage.getItem(lockKey), null);
        if (existing && existing.expiresAt > now && existing.tabId !== tabId) {
            await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 100));
            continue;
        }

        localStorage.setItem(lockKey, JSON.stringify({ tabId, expiresAt: now + ttlMs }));
        const verify = parseJSON<AccountLock | null>(localStorage.getItem(lockKey), null);
        if (verify?.tabId === tabId) return true;
    }

    return false;
};

export const releaseAccountLock = (accountJid: string, name: string) => {
    const lockKey = accountKey(accountJid, name);
    const tabId = getTabId();
    const existing = parseJSON<AccountLock | null>(localStorage.getItem(lockKey), null);
    if (existing?.tabId === tabId) {
        localStorage.removeItem(lockKey);
    }
};

export const accountKey = (accountJid: string, ...parts: string[]) => {
    const bare = toBareJid(accountJid);
    return [STORAGE_PREFIX, bare, ...parts].join(':');
};

export const toBareJid = (value?: string) => {
    if (!value) return '';
    const slashIndex = value.indexOf('/');
    if (slashIndex < 0) return value;
    return value.slice(0, slashIndex);
};

export const parseJSON = <T,>(value: string | null, fallback: T): T => {
    if (!value) return fallback;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
};

export const readAccountStore = <T,>(accountJid: string, key: string, fallback: T): T => {
    return parseJSON<T>(localStorage.getItem(accountKey(accountJid, key)), fallback);
};

export const writeAccountStore = <T,>(accountJid: string, key: string, value: T) => {
    localStorage.setItem(accountKey(accountJid, key), JSON.stringify(value));
};

export const removeAccountStore = (accountJid: string, key: string) => {
    localStorage.removeItem(accountKey(accountJid, key));
};

export const readTabStore = <T,>(accountJid: string, key: string, fallback: T): T => {
    return parseJSON<T>(sessionStorage.getItem(accountKey(accountJid, key, getTabId())), fallback);
};

export const removeTabStore = (accountJid: string, key: string) => {
    sessionStorage.removeItem(accountKey(accountJid, key, getTabId()));
};

export const bufferToBase64 = (buffer: ArrayBuffer | Uint8Array): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
};

export const base64ToBuffer = (base64: string): ArrayBuffer => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
};

export const arrayBufferToHex = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
};

export const hexToArrayBuffer = (hex: string): ArrayBuffer => {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return bytes.buffer;
};
