import { createECDH } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Ecdh } from '../../src/crypto/ecdh.js';

describe('ecdh', () => {
    it('negotiates the same shared secret on both sides', () => {
        const alice = new Ecdh('prime256v1', false);
        const bob = new Ecdh('prime256v1', false);
        const aliceShare = alice.exchange(bob.publicKey);
        const bobShare = bob.exchange(alice.publicKey);
        expect(aliceShare.equals(bobShare)).toBe(true);
    });

    it('produces compressed keys in compressed mode', () => {
        const ecdh = new Ecdh('prime256v1', true);
        expect(ecdh.publicKey.length).toBe(25);
        expect(ecdh.shareKey.length).toBe(16);
    });

    it('uses uncompressed keys on secp192k1', () => {
        const ecdh = new Ecdh('secp192k1', false);
        expect(ecdh.publicKey.length).toBe(49);
        expect(ecdh.publicKey[0]).toBe(0x04);
        expect(ecdh.shareKey.length).toBe(24);
    });

    it('uses compressed keys on secp192k1', () => {
        const ecdh = new Ecdh('secp192k1', true);
        expect(ecdh.publicKey.length).toBe(25);
        expect(ecdh.publicKey[0]).toBe(0x02);
        expect(ecdh.shareKey.length).toBe(16);
    });

    it('negotiates the same shared secret on secp192k1', () => {
        const alice = new Ecdh('secp192k1', false);
        const bob = new Ecdh('secp192k1', false);
        const aliceShare = alice.exchange(bob.publicKey);
        const bobShare = bob.exchange(alice.publicKey);
        expect(aliceShare.equals(bobShare)).toBe(true);
    });

    it('matches the native implementation on secp192k1', () => {
        const diana = new Ecdh('secp192k1', false);
        const native = createECDH('secp192k1');
        const nativePublic = native.generateKeys();
        const nativeShare = native.computeSecret(diana.publicKey);
        const dianaShare = diana.exchange(nativePublic);
        expect(dianaShare.equals(nativeShare)).toBe(true);
    });
});
