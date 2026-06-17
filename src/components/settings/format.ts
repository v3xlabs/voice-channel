export const fingerprintDisplay = (fingerprint: string) => {
    if (!fingerprint) return 'Unknown';
    return fingerprint.match(/.{1,8}/g)?.join(' ') || fingerprint;
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
