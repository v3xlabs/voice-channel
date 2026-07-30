export const oklchFromSeed = (input: string) => {
    // FNV-1a 32-bit hash
    let hash = 0x811c9dc5;

    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }

    // Mulberry32 PRNG seeded with the hash
    let seed = hash >>> 0;
    const rand = () => {
        seed |= 0;
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    // Independent random channels
    const hue = rand() * 360;
    const lightness = 0.60 + rand() * 0.20;  // 0.60-0.80
    const chroma = 0.14 + rand() * 0.18;     // 0.14-0.32

    return `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} ${hue.toFixed(1)}deg)`;
};
