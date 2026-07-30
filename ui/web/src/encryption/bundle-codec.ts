import { base64ToBuffer, bufferToBase64 } from './storage';
import type { OmemoContactBundle } from './types';

type StoredOmemoContactBundle = {
    jid: string;
    deviceId: number;
    registrationId?: number;
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
    fetchedAt: number;
};

/** Normalize stanza/lib Buffer shapes into a real ArrayBuffer. */
export const toArrayBuffer = (value: unknown): ArrayBuffer | undefined => {
    if (!value) return undefined;
    if (value instanceof ArrayBuffer) return value;
    if (value instanceof Uint8Array) {
        return value.byteOffset === 0 && value.byteLength === value.buffer.byteLength
            ? value.buffer as ArrayBuffer
            : value.slice().buffer;
    }
    if (typeof value === 'string') {
        try {
            return base64ToBuffer(value);
        } catch {
            return undefined;
        }
    }
    const maybe = value as { data?: number[]; type?: string };
    if (Array.isArray(maybe.data)) {
        return new Uint8Array(maybe.data).buffer;
    }
    return undefined;
};

const isKeyBuffer = (value: unknown): value is ArrayBuffer => {
    const buffer = toArrayBuffer(value);
    if (!buffer) return false;
    return buffer.byteLength === 32 || buffer.byteLength === 33;
};

export const isValidBundle = (bundle: OmemoContactBundle | undefined): bundle is OmemoContactBundle => {
    if (!bundle?.identityKey || !bundle.signedPreKey) return false;
    if (!isKeyBuffer(bundle.identityKey)) return false;
    if (!isKeyBuffer(bundle.signedPreKey.publicKey)) return false;
    const signature = toArrayBuffer(bundle.signedPreKey.signature);
    return Boolean(signature && signature.byteLength === 64);
};

export const serializeBundle = (bundle: OmemoContactBundle): StoredOmemoContactBundle => {
    const identityKey = toArrayBuffer(bundle.identityKey);
    const signedPublic = toArrayBuffer(bundle.signedPreKey.publicKey);
    const signature = toArrayBuffer(bundle.signedPreKey.signature);
    if (!identityKey || !signedPublic || !signature) {
        throw new Error('Cannot serialize bundle with invalid key material');
    }

    return {
        jid: bundle.jid,
        deviceId: bundle.deviceId,
        registrationId: bundle.registrationId,
        identityKey: bufferToBase64(identityKey),
        signedPreKey: {
            id: bundle.signedPreKey.id,
            publicKey: bufferToBase64(signedPublic),
            signature: bufferToBase64(signature),
        },
        preKeys: bundle.preKeys
            .map((pk) => {
                const publicKey = toArrayBuffer(pk.publicKey);
                if (!publicKey) return undefined;
                return { id: pk.id, publicKey: bufferToBase64(publicKey) };
            })
            .filter((pk): pk is { id: number; publicKey: string } => Boolean(pk)),
        fetchedAt: bundle.fetchedAt,
    };
};

export const deserializeBundle = (stored: StoredOmemoContactBundle): OmemoContactBundle | undefined => {
    try {
        const bundle: OmemoContactBundle = {
            jid: stored.jid,
            deviceId: stored.deviceId,
            registrationId: stored.registrationId,
            identityKey: base64ToBuffer(stored.identityKey),
            signedPreKey: {
                id: stored.signedPreKey.id,
                publicKey: base64ToBuffer(stored.signedPreKey.publicKey),
                signature: base64ToBuffer(stored.signedPreKey.signature),
            },
            preKeys: (stored.preKeys || []).map((pk) => ({
                id: pk.id,
                publicKey: base64ToBuffer(pk.publicKey),
            })),
            fetchedAt: stored.fetchedAt,
        };
        return isValidBundle(bundle) ? bundle : undefined;
    } catch {
        return undefined;
    }
};

export const parseBundleContent = (
    bare: string,
    deviceId: number,
    content: unknown
): OmemoContactBundle | undefined => {
    if (!content || typeof content !== 'object') return undefined;

    const raw = content as Record<string, unknown>;
    const nested = raw.omemoDevice;
    const normalized = nested && typeof nested === 'object'
        ? { ...(nested as Record<string, unknown>), ...raw }
        : raw;

    const identityKey = toArrayBuffer(normalized.identityKey);
    const signedPreKeyPublic = (normalized.signedPreKeyPublic ?? normalized.signedPreKey) as Record<string, unknown> | undefined;
    const signedPreKeyId = signedPreKeyPublic?.id ?? signedPreKeyPublic?.signedPreKeyId;
    const signedPreKeyValue = toArrayBuffer(
        signedPreKeyPublic?.value ?? signedPreKeyPublic?.publicKey
    );
    const signature = toArrayBuffer(
        normalized.signedPreKeySignature ?? signedPreKeyPublic?.signature
    );

    if (!identityKey || !signedPreKeyId || !signedPreKeyValue || !signature) return undefined;

    const preKeysRaw = Array.isArray(normalized.preKeys)
        ? normalized.preKeys
            .map((pk: Record<string, unknown>) => ({
                id: pk.id ?? pk.preKeyId,
                publicKey: toArrayBuffer(pk.value ?? pk.publicKey),
            }))
            .filter((pk): pk is { id: number; publicKey: ArrayBuffer } =>
                typeof pk.id === 'number' && pk.publicKey instanceof ArrayBuffer
            )
        : [];

    const bundle: OmemoContactBundle = {
        jid: bare,
        deviceId,
        registrationId: typeof normalized.registrationId === 'number'
            ? normalized.registrationId
            : undefined,
        identityKey,
        signedPreKey: {
            id: Number(signedPreKeyId),
            publicKey: signedPreKeyValue,
            signature,
        },
        preKeys: preKeysRaw,
        fetchedAt: Date.now(),
    };

    return isValidBundle(bundle) ? bundle : undefined;
};
