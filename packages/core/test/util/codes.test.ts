import { describe, expect, it } from 'vitest';
import { BytesReader, BytesWriter } from '../../src/util/bytes.js';
import { int32IpToString, timestamp } from '../../src/util/format.js';
import { randomInt, randomString } from '../../src/util/random.js';

describe('BytesWriter / BytesReader', () => {
    it('round-trips scalars and buffers', () => {
        const written = new BytesWriter(2)
            .writeUInt8(0x12)
            .writeUInt16BE(0x3456)
            .writeUInt32BE(0x789abcde)
            .writeBigUInt64BE(1n)
            .writeBuffer(Buffer.from([1, 2, 3]))
            .toBuffer();

        const reader = new BytesReader(written);
        expect(reader.readUInt8()).toBe(0x12);
        expect(reader.readUInt16BE()).toBe(0x3456);
        expect(reader.readUInt32BE()).toBe(0x789abcde);
        expect(reader.readBigUInt64BE()).toBe(1n);
        expect(reader.readBuffer(3).equals(Buffer.from([1, 2, 3]))).toBe(true);
        expect(reader.remaining).toBe(0);
    });
});

describe('format', () => {
    it('converts a 32-bit ip', () => {
        expect(int32IpToString(0x0102_0304)).toBe('4.3.2.1');
    });

    it('returns a second-level timestamp', () => {
        expect(timestamp()).toBe(Math.floor(Date.now() / 1000));
    });
});

describe('random', () => {
    it('generates integers within the inclusive range', () => {
        for (let i = 0; i < 100; i++) {
            const value = randomInt(3, 5);
            expect(value).toBeGreaterThanOrEqual(3);
            expect(value).toBeLessThanOrEqual(5);
        }
    });

    it('generates strings from the template', () => {
        const value = randomString(16, 'ab');
        expect(value).toHaveLength(16);
        expect(/^[ab]+$/.test(value)).toBe(true);
    });
});
