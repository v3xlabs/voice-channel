export type EncryptionMechanism = 'none' | 'omemo' | 'pgp';

export type ChatEncryptionMode = {
    mechanism: EncryptionMechanism;
    enabled: boolean;
};

export type TrustLevel = 'untrusted' | 'trusted' | 'verified';

export type TrustedKey = {
    fingerprint: string;
    level: TrustLevel;
    firstSeenAt: number;
    lastSeenAt: number;
    note?: string;
};

export type ContactTrustState = {
    devices: Record<number, TrustedKey>;
};

export type ContactTrustSummary = {
    jid: string;
    devices: Array<{
        deviceId: number;
        fingerprint: string;
        level: TrustLevel;
        firstSeenAt: number;
        lastSeenAt: number;
        note?: string;
    }>;
};

export type OmemoIdentity = {
    deviceId: number;
    identityKeyPublic: string;
    identityKeyPrivate: string;
    registrationId: number;
};

export type OmemoPreKey = {
    id: number;
    publicKey: string;
    privateKey: string;
};

export type OmemoSignedPreKey = {
    id: number;
    publicKey: string;
    privateKey: string;
    signature: string;
};

export type OmemoBundle = {
    identityKey: string;
    signedPreKey: {
        id: number;
        publicKey: string;
        signature: string;
    };
    preKeys: Array<{
        id: number;
        publicKey: string;
    }>;
};

export type StoredOmemoIdentity = {
    deviceId: number;
    registrationId: number;
    identityKeyPair: {
        pubKey: string;
        privKey: string;
    };
    signedPreKey: {
        id: number;
        keyPair: {
            pubKey: string;
            privKey: string;
        };
        signature: string;
    };
    preKeys: Array<{
        id: number;
        keyPair: {
            pubKey: string;
            privKey: string;
        };
    }>;
    createdAt: number;
};

export type OmemoContactBundle = {
    jid: string;
    deviceId: number;
    registrationId?: number;
    identityKey: ArrayBuffer;
    signedPreKey: {
        id: number;
        publicKey: ArrayBuffer;
        signature: ArrayBuffer;
    };
    preKeys: Array<{
        id: number;
        publicKey: ArrayBuffer;
    }>;
    fetchedAt: number;
};

export type OmemoDeviceList = {
    devices: number[];
    fetchedAt: number;
};
