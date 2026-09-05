// Conversations and Monal show the 32-byte Curve25519 key without its 0x05 type prefix.
// Stripping it here lets a user compare fingerprints across apps.
export const fingerprintDisplay = (fingerprint: string) => {
    if (!fingerprint) return 'Unknown';
    const bare = fingerprint.length === 66 && fingerprint.startsWith('05') ? fingerprint.slice(2) : fingerprint;
    return bare.match(/.{1,8}/g)?.join(' ') || bare;
};

export const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return '—';
    return new Date(timestamp).toLocaleString();
};

export const trustLevelLabel = (level: string) => {
    switch (level) {
        case 'verified':
            return 'Verified';
        case 'trusted':
            return 'Trusted';
        default:
            return 'Untrusted';
    }
};
