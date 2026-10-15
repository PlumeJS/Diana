import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { aesGcmDecrypt, aesGcmEncrypt } from '../../src/crypto/aes.js';

describe('aes-gcm', () => {
    it('round-trips data', () => {
        const key = randomBytes(32);
        const plain = Buffer.from('secret payload');
        const encrypted = aesGcmEncrypt(plain, key);
        expect(aesGcmDecrypt(encrypted, key).equals(plain)).toBe(true);
    });

    it('fails with a wrong key', () => {
        const encrypted = aesGcmEncrypt(Buffer.from('secret'), randomBytes(32));
        expect(() => aesGcmDecrypt(encrypted, randomBytes(32))).toThrow();
    });
});
