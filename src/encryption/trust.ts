import { createStore } from 'solid-js/store';
import {
    ContactTrustState,
    ContactTrustSummary,
    EncryptionMechanism,
    ChatEncryptionMode,
    TrustLevel,
    TrustedKey,
} from './types';
import {
    arrayBufferToHex,
    base64ToBuffer,
    readAccountStore,
    toBareJid,
    writeAccountStore,
} from './storage';

const TRUST_STORE_KEY = 'trust';
const CHAT_ENCRYPTION_KEY = 'chat-encryption';

const fingerprintFromPublicKey = (publicKey: ArrayBuffer | string): string => {
    if (typeof publicKey === 'string') {
        return arrayBufferToHex(base64ToBuffer(publicKey));
    }
    return arrayBufferToHex(publicKey);
};

export const createTrustStore = (accountJid: string) => {
    const bare = toBareJid(accountJid);
    const initialTrust = readAccountStore<Record<string, ContactTrustState>>(bare, TRUST_STORE_KEY, {});
    const initialChatEncryption = readAccountStore<Record<string, ChatEncryptionMode>>(
        bare,
        CHAT_ENCRYPTION_KEY,
        {}
    );

    const [trustByContact, setTrustByContact] = createStore<Record<string, ContactTrustState>>(initialTrust);
    const [chatEncryptionByContact, setChatEncryptionByContact] = createStore<
        Record<string, ChatEncryptionMode>
    >(initialChatEncryption);

    const persistTrust = () => writeAccountStore(bare, TRUST_STORE_KEY, trustByContact);
    const persistChatEncryption = () => writeAccountStore(bare, CHAT_ENCRYPTION_KEY, chatEncryptionByContact);

    const ensureContact = (contactJid: string) => {
        const key = toBareJid(contactJid);
        if (!trustByContact[key]) {
            setTrustByContact(key, { devices: {} });
        }
    };

    const getDeviceTrust = (contactJid: string, deviceId: number): TrustLevel => {
        return trustByContact[toBareJid(contactJid)]?.devices[deviceId]?.level || 'untrusted';
    };

    const getKeyTrust = (contactJid: string, publicKey: ArrayBuffer | string): TrustLevel => {
        const fingerprint = fingerprintFromPublicKey(publicKey);
        const devices = trustByContact[toBareJid(contactJid)]?.devices || {};
        for (const deviceId of Object.keys(devices).map(Number)) {
            if (devices[deviceId]?.fingerprint === fingerprint) {
                return devices[deviceId].level;
            }
        }
        return 'untrusted';
    };

    const recordKey = (contactJid: string, deviceId: number, publicKey: ArrayBuffer | string) => {
        const key = toBareJid(contactJid);
        const fingerprint = fingerprintFromPublicKey(publicKey);
        ensureContact(key);

        setTrustByContact(
            key,
            'devices',
            deviceId,
            (existing: TrustedKey | undefined) => {
                const now = Date.now();
                if (existing) {
                    return {
                        ...existing,
                        lastSeenAt: now,
                    };
                }
                return {
                    fingerprint,
                    level: 'untrusted',
                    firstSeenAt: now,
                    lastSeenAt: now,
                };
            }
        );
        persistTrust();
    };

    const nextTrustLevel = (level: TrustLevel): TrustLevel => {
        switch (level) {
            case 'untrusted':
                return 'trusted';
            case 'trusted':
                return 'verified';
            default:
                return 'untrusted';
        }
    };

    const cycleDeviceTrust = (contactJid: string, deviceId: number) => {
        const current = getDeviceTrust(contactJid, deviceId);
        setDeviceTrust(contactJid, deviceId, nextTrustLevel(current));
    };

    const shouldEncryptToDevice = (
        contactJid: string,
        deviceId: number,
        ownAccountJid?: string
    ): boolean => {
        const bare = toBareJid(contactJid);
        if (ownAccountJid && bare === toBareJid(ownAccountJid)) {
            return true;
        }
        const level = getDeviceTrust(bare, deviceId);
        return level === 'trusted' || level === 'verified';
    };

    const setDeviceTrust = (contactJid: string, deviceId: number, level: TrustLevel, note?: string) => {
        const key = toBareJid(contactJid);
        ensureContact(key);
        setTrustByContact(
            key,
            'devices',
            deviceId,
            (existing: TrustedKey | undefined) => {
                const now = Date.now();
                if (existing) {
                    return { ...existing, level, note: note ?? existing.note, lastSeenAt: now };
                }
                return {
                    fingerprint: '',
                    level,
                    firstSeenAt: now,
                    lastSeenAt: now,
                    note,
                };
            }
        );
        persistTrust();
    };

    const getContactDeviceIds = (contactJid: string): number[] => {
        const devices = trustByContact[toBareJid(contactJid)]?.devices || {};
        return Object.keys(devices)
            .map(Number)
            .filter((id) => !Number.isNaN(id))
            .sort((a, b) => a - b);
    };

    const isContactTrusted = (contactJid: string): boolean => {
        const devices = trustByContact[toBareJid(contactJid)]?.devices || {};
        const deviceList = Object.values(devices) as TrustedKey[];
        if (deviceList.length === 0) return false;
        return deviceList.some((d) => d.level === 'trusted' || d.level === 'verified');
    };

    const listContactTrust = (): ContactTrustSummary[] => {
        return Object.entries(trustByContact)
            .map(([jid, state]) => ({
                jid,
                devices: Object.entries(state.devices)
                    .map(([deviceId, key]) => ({
                        deviceId: Number(deviceId),
                        fingerprint: key.fingerprint,
                        level: key.level,
                        firstSeenAt: key.firstSeenAt,
                        lastSeenAt: key.lastSeenAt,
                        note: key.note,
                    }))
                    .sort((a, b) => a.deviceId - b.deviceId),
            }))
            .filter((entry) => entry.devices.length > 0)
            .sort((a, b) => a.jid.localeCompare(b.jid));
    };

    const getChatEncryption = (contactJid: string): ChatEncryptionMode => {
        const stored = chatEncryptionByContact[toBareJid(contactJid)];
        if (stored) return stored;
        return { mechanism: 'none', enabled: false };
    };

    const setChatEncryption = (contactJid: string, mode: ChatEncryptionMode) => {
        setChatEncryptionByContact(toBareJid(contactJid), mode);
        persistChatEncryption();
    };

    const setChatEncryptionEnabled = (contactJid: string, enabled: boolean) => {
        const current = getChatEncryption(contactJid);
        const next: ChatEncryptionMode = { ...current, enabled };
        setChatEncryption(contactJid, next);
    };

    const setChatEncryptionMechanism = (contactJid: string, mechanism: EncryptionMechanism) => {
        const current = getChatEncryption(contactJid);
        const next: ChatEncryptionMode = {
            mechanism,
            enabled: mechanism !== 'none' ? current.enabled : false,
        };
        setChatEncryption(contactJid, next);
    };

    return {
        trustByContact,
        chatEncryptionByContact,
        getDeviceTrust,
        getKeyTrust,
        recordKey,
        setDeviceTrust,
        cycleDeviceTrust,
        shouldEncryptToDevice,
        getContactDeviceIds,
        isContactTrusted,
        listContactTrust,
        getChatEncryption,
        setChatEncryption,
        setChatEncryptionEnabled,
        setChatEncryptionMechanism,
    };
};

export type TrustStore = ReturnType<typeof createTrustStore>;
export { fingerprintFromPublicKey };
