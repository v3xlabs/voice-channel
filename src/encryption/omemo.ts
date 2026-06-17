import type { Agent } from 'stanza';
import {
    KeyHelper,
    SessionBuilder,
    SessionCipher,
    SignalProtocolAddress,
} from '@privacyresearch/libsignal-protocol-typescript';
import type {
    KeyPairType,
    StorageType,
    SessionRecordType,
    DeviceType,
} from '@privacyresearch/libsignal-protocol-typescript';
import {
    binaryStringToArrayBuffer,
} from '@privacyresearch/libsignal-protocol-typescript/lib/helpers';
import {
    deserializeBundle,
    isValidBundle,
    parseBundleContent,
    serializeBundle,
    toArrayBuffer,
} from './bundle-codec';
import {
    OmemoContactBundle,
    OmemoDeviceList,
    StoredOmemoIdentity,
} from './types';
import {
    acquireAccountLock,
    arrayBufferToHex,
    base64ToBuffer,
    browserDevicesStoreKey,
    bufferToBase64,
    getBrowserRegisteredDevices,
    readAccountStore,
    readTabStore,
    registerBrowserDevice,
    releaseAccountLock,
    removeAccountStore,
    removeTabStore,
    toBareJid,
    unregisterBrowserDevice,
    writeAccountStore,
    writeTabStore,
} from './storage';

const IDENTITY_TAB_KEY = 'omemo-identity';
const CONTACT_DEVICES_KEY = 'omemo-contact-devices';
const CONTACT_BUNDLES_KEY = 'omemo-contact-bundles';
const SESSIONS_KEY = 'omemo-sessions';

const NS_OMEMO_AXOLOTL = 'eu.siacs.conversations.axolotl';
const NS_OMEMO_AXOLOTL_BUNDLES = `${NS_OMEMO_AXOLOTL}.bundles`;
const NS_OMEMO_AXOLOTL_DEVICELIST = `${NS_OMEMO_AXOLOTL}.devicelist`;
const bundleNodeForDevice = (deviceId: number) => `${NS_OMEMO_AXOLOTL_BUNDLES}:${deviceId}`;
const OMEMO_DEVICELIST_ITEM_ID = 'current';
const OMEMO_BUNDLE_ITEM_ID = 'current';
const IDENTITY_INIT_LOCK = 'omemo-identity-init-lock';
const PUBLISH_LOCK = 'omemo-publish-lock';

export type OmemoKeyEntry = {
    rid: number;
    prekey: boolean;
    value: ArrayBuffer;
};

export type OmemoEncryptedPayload = {
    iv: ArrayBuffer;
    sid: number;
    keys: OmemoKeyEntry[];
    payload: ArrayBuffer;
};

const randomDeviceId = () => {
    const value = Math.floor(Math.random() * 0x7fffffff) + 1;
    return value;
};

const exportKeyPair = (kp: KeyPairType): { pubKey: string; privKey: string } => ({
    pubKey: bufferToBase64(kp.pubKey),
    privKey: bufferToBase64(kp.privKey),
});

const importKeyPair = (kp: { pubKey: string; privKey: string }): KeyPairType => ({
    pubKey: base64ToBuffer(kp.pubKey),
    privKey: base64ToBuffer(kp.privKey),
});

const OMEMO_AES_KEY_BYTES = 16;
const OMEMO_GCM_TAG_BITS = 128;
const OMEMO_GCM_IV_BYTES = 12;
const OMEMO_PUBLISHED_PREKEY_COUNT = 20;
const PUBSUB_PUBLISH_OPTIONS_FORM = 'http://jabber.org/protocol/pubsub#publish-options';
const PUBSUB_NODE_CONFIG_FORM = 'http://jabber.org/protocol/pubsub#node_config';

const getRandomBytes = (n: number): ArrayBuffer => {
    const arr = new Uint8Array(n);
    crypto.getRandomValues(arr);
    return arr.buffer;
};

const concatBuffers = (a: ArrayBuffer, b: ArrayBuffer): ArrayBuffer => {
    const merged = new Uint8Array(a.byteLength + b.byteLength);
    merged.set(new Uint8Array(a), 0);
    merged.set(new Uint8Array(b), a.byteLength);
    return merged.buffer;
};

/** XEP-0384 payload encryption — AES-128-GCM, 12-byte IV, tag kept separate from payload. */
const encryptOmemoPayload = async (
    plaintext: string
): Promise<{ iv: ArrayBuffer; payload: ArrayBuffer; keyAndTag: ArrayBuffer }> => {
    const aesKey = getRandomBytes(OMEMO_AES_KEY_BYTES);
    const iv = getRandomBytes(OMEMO_GCM_IV_BYTES);
    const cryptoKey = await crypto.subtle.importKey('raw', aesKey, { name: 'AES-GCM' }, false, ['encrypt']);
    const encoded = new TextEncoder().encode(plaintext);
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv), tagLength: OMEMO_GCM_TAG_BITS },
        cryptoKey,
        encoded
    );
    const tagBytes = OMEMO_GCM_TAG_BITS / 8;
    const payload = encrypted.slice(0, encrypted.byteLength - tagBytes);
    const tag = encrypted.slice(encrypted.byteLength - tagBytes);
    return {
        iv,
        payload,
        keyAndTag: concatBuffers(aesKey, tag),
    };
};

/** Decrypt OMEMO payload using key+tag material recovered from the per-device header key. */
const decryptOmemoPayload = async (
    keyAndTag: ArrayBuffer,
    iv: ArrayBuffer,
    payload: ArrayBuffer
): Promise<string | undefined> => {
    const tagBytes = OMEMO_GCM_TAG_BITS / 8;
    if (keyAndTag.byteLength < OMEMO_AES_KEY_BYTES + tagBytes) return undefined;

    const aesKey = keyAndTag.slice(0, OMEMO_AES_KEY_BYTES);
    const tag = keyAndTag.slice(OMEMO_AES_KEY_BYTES, OMEMO_AES_KEY_BYTES + tagBytes);
    const ciphertextWithTag = concatBuffers(payload, tag);

    try {
        const cryptoKey = await crypto.subtle.importKey('raw', aesKey, { name: 'AES-GCM' }, false, ['decrypt']);
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: new Uint8Array(iv), tagLength: OMEMO_GCM_TAG_BITS },
            cryptoKey,
            ciphertextWithTag
        );
        return new TextDecoder().decode(decrypted);
    } catch {
        return undefined;
    }
};

const addressFor = (jid: string, deviceId: number) => new SignalProtocolAddress(toBareJid(jid), deviceId);

const bundleToDeviceType = (bundle: OmemoContactBundle): DeviceType => {
    const identityKey = toArrayBuffer(bundle.identityKey);
    const signedPublic = toArrayBuffer(bundle.signedPreKey.publicKey);
    const signature = toArrayBuffer(bundle.signedPreKey.signature);
    const preKey = bundle.preKeys[0];
    const preKeyPublic = preKey ? toArrayBuffer(preKey.publicKey) : undefined;

    if (!identityKey || !signedPublic || !signature) {
        throw new Error('Invalid OMEMO bundle key material');
    }

    return {
        identityKey,
        signedPreKey: {
            keyId: bundle.signedPreKey.id,
            publicKey: signedPublic,
            signature,
        },
        preKey: preKey && preKeyPublic
            ? {
                keyId: preKey.id,
                publicKey: preKeyPublic,
            }
            : undefined,
        registrationId: bundle.registrationId ?? bundle.deviceId,
    };
};

export class OmemoManager {
    private accountJid: string;
    private client: Agent | undefined;
    private identity: StoredOmemoIdentity | undefined;
    private sessions: Record<string, SessionRecordType> = {};

    // In-memory caches — survive within the same session, avoid redundant network
    private cachedDeviceLists: Record<string, OmemoDeviceList> = {};
    private cachedBundles: Record<string, OmemoContactBundle> = {};
    private pepAccessEnsured = new Set<string>();
    private shouldEncryptToDevice: ((contactJid: string, deviceId: number) => boolean) | undefined;

    private storageListener: ((event: StorageEvent) => void) | undefined;

    constructor(accountJid: string) {
        this.accountJid = toBareJid(accountJid);
        this.sessions = readAccountStore<Record<string, SessionRecordType>>(this.accountJid, SESSIONS_KEY, {});
        this.cachedDeviceLists = readAccountStore<Record<string, OmemoDeviceList>>(
            this.accountJid,
            CONTACT_DEVICES_KEY,
            {}
        );
    }

    /** Known device IDs from cache — no network. */
    getKnownDevices(contactJid: string, extraDeviceIds: number[] = []): number[] {
        const bare = toBareJid(contactJid);
        const fromList = this.getCachedDeviceList(bare)?.devices || [];
        const merged = new Set<number>(fromList);
        for (const deviceId of extraDeviceIds) {
            if (merged.has(deviceId) || this.getCachedBundle(bare, deviceId)) {
                merged.add(deviceId);
            }
        }
        return Array.from(merged).sort((a, b) => a - b);
    }

    bindClient(client: Agent | undefined) {
        this.client = client;

        if (typeof window === 'undefined' || this.storageListener) return;

        const browserDevicesKey = browserDevicesStoreKey(this.accountJid);
        this.storageListener = (event: StorageEvent) => {
            if (event.key !== browserDevicesKey || !event.newValue) return;
            void this.ensurePublished().catch((error) => {
                console.warn('Failed to republish after browser device registry change', error);
            });
        };
        window.addEventListener('storage', this.storageListener);
    }

    setEncryptFilter(filter: ((contactJid: string, deviceId: number) => boolean) | undefined) {
        this.shouldEncryptToDevice = filter;
    }

    private canEncryptToDevice(contactJid: string, deviceId: number): boolean {
        if (!this.shouldEncryptToDevice) return true;
        return this.shouldEncryptToDevice(contactJid, deviceId);
    }

    // -----------------------------------------------------------------------
    // Identity
    // -----------------------------------------------------------------------

    async initialize() {
        const stored = readTabStore<StoredOmemoIdentity | undefined>(
            this.accountJid,
            IDENTITY_TAB_KEY,
            undefined
        );

        if (stored) {
            this.identity = stored;
            registerBrowserDevice(this.accountJid, stored.deviceId);
            this.purgeCorruptedBundleCache();
            this.persistLocalBundle();
            return;
        }

        const acquired = await acquireAccountLock(this.accountJid, IDENTITY_INIT_LOCK, 15_000);
        if (!acquired) {
            await new Promise((resolve) => setTimeout(resolve, 250));
            const retry = readTabStore<StoredOmemoIdentity | undefined>(
                this.accountJid,
                IDENTITY_TAB_KEY,
                undefined
            );
            if (retry) {
                this.identity = retry;
                registerBrowserDevice(this.accountJid, retry.deviceId);
                this.persistLocalBundle();
                return;
            }
        }

        try {
            const existing = readTabStore<StoredOmemoIdentity | undefined>(
                this.accountJid,
                IDENTITY_TAB_KEY,
                undefined
            );
            if (existing) {
                this.identity = existing;
                registerBrowserDevice(this.accountJid, existing.deviceId);
                this.persistLocalBundle();
                return;
            }

            const identityKeyPair = await KeyHelper.generateIdentityKeyPair();
            const registrationId = KeyHelper.generateRegistrationId();
            const deviceId = randomDeviceId();
            const signedPreKeyId = 1;
            const signedPreKey = await KeyHelper.generateSignedPreKey(identityKeyPair, signedPreKeyId);

            const preKeyCount = 100;
            const preKeys: Array<{ id: number; keyPair: { pubKey: string; privKey: string } }> = [];
            for (let i = 0; i < preKeyCount; i++) {
                const pk = await KeyHelper.generatePreKey(i + 1);
                preKeys.push({ id: pk.keyId, keyPair: exportKeyPair(pk.keyPair) });
            }

            this.identity = {
                deviceId,
                registrationId,
                identityKeyPair: exportKeyPair(identityKeyPair),
                signedPreKey: {
                    id: signedPreKey.keyId,
                    keyPair: exportKeyPair(signedPreKey.keyPair),
                    signature: bufferToBase64(signedPreKey.signature),
                },
                preKeys,
                createdAt: Date.now(),
            };

            this.persistIdentity();
            registerBrowserDevice(this.accountJid, deviceId);
            removeAccountStore(this.accountJid, 'omemo-identity');
            this.purgeCorruptedBundleCache();
            this.persistLocalBundle();
        } finally {
            releaseAccountLock(this.accountJid, IDENTITY_INIT_LOCK);
        }
    }

    private purgeCorruptedBundleCache() {
        const all = readAccountStore<Record<string, unknown>>(
            this.accountJid,
            CONTACT_BUNDLES_KEY,
            {}
        );
        let changed = false;

        for (const [key, value] of Object.entries(all)) {
            if (deserializeBundle(value as Parameters<typeof deserializeBundle>[0])) continue;
            delete all[key];
            delete this.cachedBundles[key];
            changed = true;
        }

        if (changed) {
            writeAccountStore(this.accountJid, CONTACT_BUNDLES_KEY, all);
        }
    }

    private persistIdentity() {
        if (!this.identity) return;
        writeTabStore(this.accountJid, IDENTITY_TAB_KEY, this.identity);
    }

    private persistSessions() {
        writeAccountStore(this.accountJid, SESSIONS_KEY, this.sessions);
    }

    getDeviceId(): number | undefined {
        return this.identity?.deviceId;
    }

    getRegistrationId(): number | undefined {
        return this.identity?.registrationId;
    }

    getIdentityKeyPair(): KeyPairType | undefined {
        if (!this.identity) return undefined;
        return importKeyPair(this.identity.identityKeyPair);
    }

    getIdentityKeyFingerprint(): string {
        if (!this.identity) return '';
        return arrayBufferToHex(base64ToBuffer(this.identity.identityKeyPair.pubKey));
    }

    getIdentityCreatedAt(): number | undefined {
        return this.identity?.createdAt;
    }

    getPreKeysRemaining(): number | undefined {
        return this.identity?.preKeys.length;
    }

    getSignedPreKeyId(): number | undefined {
        return this.identity?.signedPreKey.id;
    }

    identityKeyFingerprintFromBuffer(key: unknown): string {
        const buffer = toArrayBuffer(key);
        if (!buffer) return '';
        return arrayBufferToHex(buffer);
    }

    getOwnDeviceFingerprint(deviceId: number): string {
        if (this.identity?.deviceId === deviceId) {
            return this.getIdentityKeyFingerprint();
        }
        const bundle = this.getCachedBundle(this.accountJid, deviceId);
        if (!bundle) return '';
        return this.identityKeyFingerprintFromBuffer(bundle.identityKey);
    }

    /** Build this session's published OMEMO bundle from local identity. */
    buildLocalDeviceBundle(): OmemoContactBundle | undefined {
        if (!this.identity) return undefined;

        const preKey = this.identity.preKeys[0];
        if (!preKey) return undefined;

        const bundle: OmemoContactBundle = {
            jid: this.accountJid,
            deviceId: this.identity.deviceId,
            registrationId: this.identity.registrationId,
            identityKey: base64ToBuffer(this.identity.identityKeyPair.pubKey),
            signedPreKey: {
                id: this.identity.signedPreKey.id,
                publicKey: base64ToBuffer(this.identity.signedPreKey.keyPair.pubKey),
                signature: base64ToBuffer(this.identity.signedPreKey.signature),
            },
            preKeys: [{
                id: preKey.id,
                publicKey: base64ToBuffer(preKey.keyPair.pubKey),
            }],
            fetchedAt: Date.now(),
        };

        return isValidBundle(bundle) ? bundle : undefined;
    }

    private persistLocalBundle() {
        const bundle = this.buildLocalDeviceBundle();
        if (bundle) this.persistBundle(this.accountJid, bundle.deviceId, bundle);
    }

    private async resolveDeviceBundle(
        contactJid: string,
        deviceId: number
    ): Promise<OmemoContactBundle | undefined> {
        const bare = toBareJid(contactJid);
        if (bare === this.accountJid && deviceId === this.identity?.deviceId) {
            return this.buildLocalDeviceBundle();
        }

        const cached = this.getCachedBundle(bare, deviceId);
        if (cached && isValidBundle(cached)) return cached;

        return this._fetchBundleNetwork(bare, deviceId);
    }

    // -----------------------------------------------------------------------
    // Publishing
    // -----------------------------------------------------------------------

    getBundle(): { deviceId: number; bundle: any } | undefined {
        if (!this.identity) return undefined;
        return {
            deviceId: this.identity.deviceId,
            bundle: {
                itemType: NS_OMEMO_AXOLOTL_BUNDLES,
                identityKey: base64ToBuffer(this.identity.identityKeyPair.pubKey),
                signedPreKeyPublic: {
                    id: this.identity.signedPreKey.id,
                    value: base64ToBuffer(this.identity.signedPreKey.keyPair.pubKey),
                },
                signedPreKeySignature: base64ToBuffer(this.identity.signedPreKey.signature),
                preKeys: this.identity.preKeys.slice(0, OMEMO_PUBLISHED_PREKEY_COUNT).map((pk) => ({
                    id: pk.id,
                    value: base64ToBuffer(pk.keyPair.pubKey),
                })),
            },
        };
    }

    private pepPublishOptionsForm() {
        return {
            type: 'submit',
            fields: [
                {
                    name: 'FORM_TYPE',
                    type: 'hidden',
                    value: PUBSUB_PUBLISH_OPTIONS_FORM,
                },
                {
                    name: 'pubsub#access_model',
                    value: 'open',
                },
            ],
        };
    }

    private pepNodeConfigForm() {
        return {
            type: 'submit',
            fields: [
                {
                    name: 'FORM_TYPE',
                    type: 'hidden',
                    value: PUBSUB_NODE_CONFIG_FORM,
                },
                {
                    name: 'pubsub#access_model',
                    value: 'open',
                },
            ],
        };
    }

    private isPubsubPreconditionNotMet(error: unknown): boolean {
        const err = error as { error?: { pubsubError?: string } };
        return err?.error?.pubsubError === 'precondition-not-met';
    }

    private async ensurePepNodeOpen(node: string) {
        const xmpp = this.client as Agent & {
            configureNode?: (jid: string, node: string, form: unknown) => Promise<unknown>;
        };
        if (!xmpp?.configureNode) return;
        if (this.pepAccessEnsured.has(node)) return;

        try {
            await xmpp.configureNode('', node, this.pepNodeConfigForm());
            this.pepAccessEnsured.add(node);
        } catch (error) {
            console.warn('Failed to configure PEP node access model', node, error);
        }
    }

    /**
     * XEP-0060 publish with publish-options (access_model=open).
     * Matches Conversations/iNPUTmice PEP algorithm so Gajim/Monal can fetch keys.
     */
    private async pepPublish(node: string, content: unknown, itemId: string) {
        const xmpp = this.client as Agent & {
            sendIQ?: (iq: unknown) => Promise<unknown>;
            configureNode?: (jid: string, node: string, form: unknown) => Promise<unknown>;
            publish?: (jid: string, node: string, item: unknown, id?: string) => Promise<unknown>;
        };
        if (!xmpp?.sendIQ) throw new Error('No XMPP client');

        const publishIq = {
            to: '',
            type: 'set',
            pubsub: {
                context: 'user',
                publish: {
                    node,
                    item: {
                        id: itemId,
                        content,
                    },
                },
                publishOptions: this.pepPublishOptionsForm(),
            },
        };

        try {
            await xmpp.sendIQ(publishIq);
            return;
        } catch (error) {
            if (this.isPubsubPreconditionNotMet(error)) {
                await this.ensurePepNodeOpen(node);
                try {
                    await xmpp.sendIQ(publishIq);
                    return;
                } catch (retryError) {
                    console.warn('PEP publish retry failed after configure', node, retryError);
                }
            } else {
                console.warn('PEP publish with options failed', node, error);
            }
        }

        if (xmpp.publish) {
            await xmpp.publish('', node, content, itemId);
        }
    }

    async publishBundle() {
        const bundle = this.getBundle();
        if (!bundle) return;
        await this.pepPublish(
            bundleNodeForDevice(bundle.deviceId),
            bundle.bundle,
            OMEMO_BUNDLE_ITEM_ID
        );
        this.persistLocalBundle();
    }

    async refreshOwnDeviceList(throwOnError = false): Promise<number[]> {
        const xmpp = this.client;
        if (!xmpp || !this.identity) {
            if (throwOnError) throw new Error('No client or identity');
            return [];
        }

        try {
            const response = await xmpp.getItems(
                this.accountJid,
                NS_OMEMO_AXOLOTL_DEVICELIST,
                { max: 1 }
            );
            const devices = ((response?.items?.[0]?.content as any)?.devices || []) as number[];
            this.persistDeviceList(this.accountJid, { devices, fetchedAt: Date.now() });
            return devices;
        } catch (error) {
            console.warn('refreshOwnDeviceList failed', error);
            if (throwOnError) throw error;
            return this.getCachedDeviceList(this.accountJid)?.devices || [];
        }
    }

    private mergeDeviceList(existing: number[], extra: number[] = []): number[] {
        const merged = new Set<number>(existing);
        if (this.identity) merged.add(this.identity.deviceId);
        for (const deviceId of getBrowserRegisteredDevices(this.accountJid)) {
            merged.add(deviceId);
        }
        for (const deviceId of extra) merged.add(deviceId);
        return Array.from(merged).sort((a, b) => a - b);
    }

    /** Drop stale device IDs that have no published bundle (except local browser tabs). */
    private async filterDevicesForPublish(candidates: number[]): Promise<number[]> {
        const localDevices = new Set<number>(getBrowserRegisteredDevices(this.accountJid));
        if (this.identity) localDevices.add(this.identity.deviceId);

        const kept: number[] = [];
        for (const deviceId of candidates) {
            if (localDevices.has(deviceId)) {
                kept.push(deviceId);
                continue;
            }

            const bundle = await this._fetchBundleNetwork(this.accountJid, deviceId);
            if (bundle && isValidBundle(bundle)) {
                kept.push(deviceId);
            }
        }

        return kept.sort((a, b) => a - b);
    }

    private async publishMergedDeviceList(extraDeviceIds: number[] = []): Promise<number[]> {
        const xmpp = this.client;
        if (!xmpp || !this.identity) throw new Error('No client or identity');

        const existing = await this.refreshOwnDeviceList(true);
        const merged = this.mergeDeviceList(existing, extraDeviceIds);
        const allDevices = await this.filterDevicesForPublish(merged);

        await this.pepPublish(
            NS_OMEMO_AXOLOTL_DEVICELIST,
            { itemType: NS_OMEMO_AXOLOTL_DEVICELIST, devices: allDevices },
            OMEMO_DEVICELIST_ITEM_ID
        );

        this.persistDeviceList(this.accountJid, { devices: allDevices, fetchedAt: Date.now() });
        return allDevices;
    }

    /** Merge with the server device list and publish our device + bundle. */
    async ensurePublished(extraDeviceIds: number[] = []): Promise<number[]> {
        if (!this.identity) await this.initialize();
        if (!this.identity) throw new Error('No OMEMO identity');
        const xmpp = this.client;
        if (!xmpp) throw new Error('No XMPP client');

        const acquired = await acquireAccountLock(this.accountJid, PUBLISH_LOCK, 30_000);
        if (!acquired) {
            return this.refreshOwnDeviceList();
        }

        let publishedDevices: number[] = [];
        try {
            for (let attempt = 0; attempt < 3; attempt++) {
                publishedDevices = await this.publishMergedDeviceList(extraDeviceIds);
                const verified = await this.refreshOwnDeviceList(true);
                if (verified.includes(this.identity.deviceId)) {
                    publishedDevices = verified;
                    break;
                }
            }

            if (!publishedDevices.includes(this.identity.deviceId)) {
                throw new Error('Could not publish device list');
            }

            try {
                await this.publishBundle();
            } catch (error) {
                console.error('Failed to publish OMEMO bundle', error);
            }

            void this.ensureContactKeyStore(this.accountJid, true);

            return publishedDevices;
        } catch (error) {
            console.error('Failed to publish OMEMO device list', error);
            throw error;
        } finally {
            releaseAccountLock(this.accountJid, PUBLISH_LOCK);
        }
    }

    // -----------------------------------------------------------------------
    // Key store — cache-first contact device & bundle access
    // -----------------------------------------------------------------------

    private persistDeviceList(contactJid: string, list: OmemoDeviceList) {
        this.cachedDeviceLists[contactJid] = list;
        writeAccountStore(this.accountJid, CONTACT_DEVICES_KEY, {
            ...readAccountStore<Record<string, OmemoDeviceList>>(this.accountJid, CONTACT_DEVICES_KEY, {}),
            [contactJid]: list,
        });
    }

    private persistBundle(contactJid: string, deviceId: number, bundle: OmemoContactBundle) {
        if (!isValidBundle(bundle)) return;

        const key = `${toBareJid(contactJid)}:${deviceId}`;
        this.cachedBundles[key] = bundle;

        const all = readAccountStore<Record<string, ReturnType<typeof serializeBundle>>>(
            this.accountJid,
            CONTACT_BUNDLES_KEY,
            {}
        );
        try {
            all[key] = serializeBundle(bundle);
            writeAccountStore(this.accountJid, CONTACT_BUNDLES_KEY, all);
        } catch (error) {
            console.warn('Failed to persist OMEMO bundle', key, error);
        }
    }

    /** Get cached device list (in-memory, then localStorage), no network */
    getCachedDeviceList(contactJid: string): OmemoDeviceList | undefined {
        const bare = toBareJid(contactJid);
        return this.cachedDeviceLists[bare]
            || readAccountStore<Record<string, OmemoDeviceList>>(
                this.accountJid,
                CONTACT_DEVICES_KEY,
                {}
            )[bare];
    }

    /** Get cached bundle (in-memory, then localStorage), no network */
    getCachedBundle(contactJid: string, deviceId: number): OmemoContactBundle | undefined {
        const bare = toBareJid(contactJid);
        const key = `${bare}:${deviceId}`;

        const cached = this.cachedBundles[key];
        if (cached && isValidBundle(cached)) return cached;

        const stored = readAccountStore<Record<string, unknown>>(
            this.accountJid,
            CONTACT_BUNDLES_KEY,
            {}
        )[key];

        if (!stored || typeof stored !== 'object') return undefined;

        const bundle = deserializeBundle(stored as Parameters<typeof deserializeBundle>[0]);
        if (bundle) {
            this.cachedBundles[key] = bundle;
            return bundle;
        }

        return undefined;
    }

    /** Ensure we have the keystore for a contact. Cache-first; network only for missing data. */
    async ensureContactKeyStore(
        contactJid: string,
        refreshDevices = false
    ): Promise<{
        devices: number[];
        bundles: OmemoContactBundle[];
    }> {
        const bare = toBareJid(contactJid);
        let deviceList = this.getCachedDeviceList(bare);

        if (!deviceList || refreshDevices) {
            deviceList = await this._fetchDeviceListNetwork(bare);
            if (deviceList) this.persistDeviceList(bare, deviceList);
        }

        const devices = deviceList?.devices || [];
        this._ensureContactPepAccess(bare);

        const bundleResults = await Promise.all(
            devices.map(async (deviceId) => this.resolveDeviceBundle(bare, deviceId))
        );

        const bundles = bundleResults.filter(
            (bundle): bundle is OmemoContactBundle => Boolean(bundle && isValidBundle(bundle))
        );

        return { devices, bundles };
    }

    /** Fetch device list from network (with cache fallback on error) */
    private async _fetchDeviceListNetwork(contactJid: string): Promise<OmemoDeviceList | undefined> {
        const xmpp = this.client;
        if (!xmpp) return this.getCachedDeviceList(contactJid);

        const bare = toBareJid(contactJid);
        this._ensureContactPepAccess(bare);

        try {
            const response = await xmpp.getItems(
                bare,
                NS_OMEMO_AXOLOTL_DEVICELIST,
                { max: 1 }
            );
            const devices = ((response?.items?.[0]?.content as any)?.devices || []) as number[];
            return { devices, fetchedAt: Date.now() };
        } catch (error) {
            console.warn('Failed to fetch device list for', contactJid, error);
            return this.getCachedDeviceList(contactJid);
        }
    }

    private _ensureContactPepAccess(contactJid: string) {
        const xmpp = this.client;
        if (!xmpp) return;

        const bare = toBareJid(contactJid);
        if (this.pepAccessEnsured.has(bare)) return;
        this.pepAccessEnsured.add(bare);

        if (bare !== this.accountJid) {
            try {
                xmpp.sendPresence({ to: bare, type: 'probe' });
            } catch {
                // best-effort
            }
        }
    }

    /** Fetch bundle via stanza pubsub — one node, one item (`current`). */
    private async _fetchBundleNetwork(contactJid: string, deviceId: number): Promise<OmemoContactBundle | undefined> {
        const xmpp = this.client;
        if (!xmpp) return this.getCachedBundle(contactJid, deviceId);

        const bare = toBareJid(contactJid);
        this._ensureContactPepAccess(bare);

        const node = bundleNodeForDevice(deviceId);

        try {
            const response = await xmpp.getItems(bare, node, { max: 1 });
            for (const item of response?.items || []) {
                const bundle = parseBundleContent(bare, deviceId, item?.content);
                if (bundle) {
                    this.persistBundle(bare, deviceId, bundle);
                    return bundle;
                }
            }
        } catch {
            // Node missing or access denied — expected for stale device IDs.
        }

        return this.getCachedBundle(contactJid, deviceId);
    }

    // -----------------------------------------------------------------------
    // Encryption
    // -----------------------------------------------------------------------

    async encryptMessage(contactJid: string, plaintext: string): Promise<OmemoEncryptedPayload | undefined> {
        if (!this.identity) {
            console.warn('encryptMessage: no identity');
            return undefined;
        }

        const contactBare = toBareJid(contactJid);

        // Use keystore — cache first, network if needed
        const keystore = await this.ensureContactKeyStore(contactBare, false);
        if (keystore.devices.length === 0) {
            console.warn('encryptMessage: no devices found for', contactBare);
            return undefined;
        }

        const { iv, payload, keyAndTag } = await encryptOmemoPayload(plaintext);

        const keys: OmemoKeyEntry[] = [];
        const storage = this.createStorageAdapter();

        // Encrypt for contact devices (use already-fetched bundles from keystore)
        for (const deviceId of keystore.devices) {
            if (deviceId === this.identity.deviceId) continue;
            if (!this.canEncryptToDevice(contactBare, deviceId)) continue;

            const bundle = keystore.bundles.find((b) => b.deviceId === deviceId);
            if (!bundle || !isValidBundle(bundle)) {
                console.warn('encryptMessage: no valid bundle for device', contactBare, deviceId);
                continue;
            }

            try {
                const address = addressFor(contactBare, deviceId);
                await this.ensureSession(address, bundle);

                const cipher = new SessionCipher(storage, address);
                const encryptedKey = await cipher.encrypt(keyAndTag);
                keys.push({
                    rid: deviceId,
                    prekey: encryptedKey.type === 3,
                    value: binaryStringToArrayBuffer(encryptedKey.body!),
                });
            } catch (error) {
                console.error('encryptMessage: failed for contact device', contactBare, deviceId, error);
            }
        }

        // Encrypt for own other devices (only those with valid bundles)
        try {
            const ownDevices = this.mergeDeviceList(await this.refreshOwnDeviceList(), []).filter(
                (id) => id !== this.identity!.deviceId
            );
            for (const deviceId of ownDevices) {
                if (keys.some((k) => k.rid === deviceId)) continue;

                const bundle = await this.resolveDeviceBundle(this.accountJid, deviceId);
                if (!bundle || !isValidBundle(bundle)) {
                    console.warn('encryptMessage: no valid bundle for own device', deviceId);
                    continue;
                }

                try {
                    const address = addressFor(this.accountJid, deviceId);
                    await this.ensureSession(address, bundle);
                    const cipher = new SessionCipher(storage, address);
                    const encryptedKey = await cipher.encrypt(keyAndTag);
                    keys.push({
                        rid: deviceId,
                        prekey: encryptedKey.type === 3,
                        value: binaryStringToArrayBuffer(encryptedKey.body!),
                    });
                } catch (error) {
                    console.error('encryptMessage: failed for own device', deviceId, error);
                }
            }
        } catch (error) {
            console.error('encryptMessage: own device list failed', error);
        }

        if (keys.length === 0) {
            console.warn('encryptMessage: no keys produced for', contactBare);
            return undefined;
        }

        return {
            iv,
            sid: this.identity.deviceId,
            keys,
            payload,
        };
    }

    async decryptMessage(
        fromJid: string,
        senderDeviceId: number,
        iv: ArrayBuffer | Uint8Array,
        encryptedKey: ArrayBuffer | Uint8Array,
        isPreKey: boolean,
        payload: ArrayBuffer | Uint8Array
    ): Promise<string | undefined> {
        const ivBuffer = toArrayBuffer(iv);
        const keyBuffer = toArrayBuffer(encryptedKey);
        const payloadBuffer = toArrayBuffer(payload);
        if (!ivBuffer || !keyBuffer || !payloadBuffer) return undefined;

        const fromBare = toBareJid(fromJid);
        const address = addressFor(fromBare, senderDeviceId);
        const storage = this.createStorageAdapter();

        try {
            const cipher = new SessionCipher(storage, address);
            const messageKey = isPreKey
                ? await cipher.decryptPreKeyWhisperMessage(keyBuffer)
                : await cipher.decryptWhisperMessage(keyBuffer);

            if (!messageKey || messageKey.byteLength === 0) return undefined;
            return decryptOmemoPayload(messageKey, ivBuffer, payloadBuffer);
        } catch (error) {
            console.error('Failed to decrypt OMEMO message from', fromBare, 'device', senderDeviceId, error);
            return undefined;
        }
    }

    // -----------------------------------------------------------------------
    // Session management
    // -----------------------------------------------------------------------

    private async ensureSession(address: SignalProtocolAddress, bundle: OmemoContactBundle): Promise<void> {
        const storage = this.createStorageAdapter();
        const existing = await storage.loadSession(address.toString());
        if (existing) return;

        const builder = new SessionBuilder(storage, address);
        await builder.processPreKey(bundleToDeviceType(bundle));
    }

    // -----------------------------------------------------------------------
    // Storage adapter for Signal library
    // -----------------------------------------------------------------------

    createStorageAdapter(): StorageType {
        const self = this;
        return {
            getIdentityKeyPair: async () => self.getIdentityKeyPair(),
            getLocalRegistrationId: async () => self.identity?.registrationId,
            isTrustedIdentity: async () => true,
            saveIdentity: async () => true,
            loadPreKey: async (keyId: number | string) => {
                const id = typeof keyId === 'string' ? parseInt(keyId, 10) : keyId;
                const pk = self.identity?.preKeys.find((k) => k.id === id);
                return pk ? importKeyPair(pk.keyPair) : undefined;
            },
            storePreKey: async () => {},
            removePreKey: async (keyId: number | string) => {
                const id = typeof keyId === 'string' ? parseInt(keyId, 10) : keyId;
                if (!self.identity) return;
                self.identity.preKeys = self.identity.preKeys.filter((k) => k.id !== id);
                self.persistIdentity();
            },
            loadSession: async (encodedAddress: string) => self.sessions[encodedAddress],
            storeSession: async (encodedAddress: string, record: SessionRecordType) => {
                self.sessions[encodedAddress] = record;
                self.persistSessions();
            },
            loadSignedPreKey: async (keyId: number | string) => {
                const id = typeof keyId === 'string' ? parseInt(keyId, 10) : keyId;
                if (self.identity?.signedPreKey.id !== id) return undefined;
                return importKeyPair(self.identity.signedPreKey.keyPair);
            },
            storeSignedPreKey: async () => {},
            removeSignedPreKey: async () => {},
        };
    }

    clear() {
        removeTabStore(this.accountJid, IDENTITY_TAB_KEY);
        removeAccountStore(this.accountJid, 'omemo-identity');
        unregisterBrowserDevice(this.accountJid);
        removeAccountStore(this.accountJid, CONTACT_DEVICES_KEY);
        removeAccountStore(this.accountJid, CONTACT_BUNDLES_KEY);
        removeAccountStore(this.accountJid, SESSIONS_KEY);
        this.identity = undefined;
        this.sessions = {};
        this.cachedDeviceLists = {};
        this.cachedBundles = {};
        this.pepAccessEnsured.clear();
    }
}
