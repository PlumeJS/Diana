import { describe, expect, it } from 'vitest';
import { bytesField, decodeTlv, encodeTlv, fixedBytesField, nestedField, scalarField, stringField } from '../../src/tlv/index.js';

describe('tlv codec', () => {
    const schema = [
        scalarField('version', 'uint16'),
        bytesField('data', 'uint16', true),
        stringField('name', 'uint8'),
        fixedBytesField('key', 4),
        nestedField('inner', () => [scalarField('value', 'uint32')], 'uint16', true),
    ];

    it('round-trips a full schema', () => {
        const data = {
            version: 0x1234,
            data: Buffer.from([1, 2, 3]),
            name: 'tanebi',
            key: Buffer.from([9, 9, 9, 9]),
            inner: { value: 42 },
        };
        const decoded = decodeTlv(schema, encodeTlv(schema, data));
        expect(decoded).toEqual(data);
    });

    it('accounts for the prefix when lengthIncludesPrefix is set', () => {
        const single = [bytesField('data', 'uint16', true)];
        const encoded = encodeTlv(single, { data: Buffer.from([1, 2, 3]) });
        expect(encoded.readUInt16BE(0)).toBe(5);
        expect(decodeTlv(single, encoded)).toEqual({ data: Buffer.from([1, 2, 3]) });
    });

    it('throws when a bytes field is not a buffer', () => {
        expect(() => encodeTlv([bytesField('data', 'uint8')], { data: 'oops' })).toThrow();
    });
});
