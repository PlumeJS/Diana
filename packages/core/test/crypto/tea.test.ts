import { describe, expect, it } from 'vitest';
import { decryptTea, encryptTea } from '../../src/crypto/tea.js';

const key = Buffer.from('0123456789abcdef', 'utf8');

describe('tea', () => {
    it('round-trips arbitrary data', () => {
        for (const text of ['', 'a', 'hello tanebi', 'x'.repeat(200)]) {
            const plain = Buffer.from(text);
            const encrypted = encryptTea(plain, key);
            expect(encrypted.length % 8).toBe(0);
            expect(decryptTea(encrypted, key).equals(plain)).toBe(true);
        }
    });

    it('rejects data whose length is not a multiple of 8', () => {
        expect(() => decryptTea(Buffer.alloc(7), key)).toThrow();
    });

    it('detects tampered ciphertext', () => {
        const encrypted = encryptTea(Buffer.from('tamper me'), key);
        encrypted[0] ^= 0xff;
        expect(() => decryptTea(encrypted, key)).toThrow();
    });

    it('does not mutate the input ciphertext', () => {
        const encrypted = encryptTea(Buffer.from('immutable'), key);
        const snapshot = Buffer.from(encrypted);
        decryptTea(encrypted, key);
        expect(encrypted.equals(snapshot)).toBe(true);
    });
});
