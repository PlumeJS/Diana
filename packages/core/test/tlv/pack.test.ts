import { describe, expect, it } from 'vitest';
import { bytesField, packTlv, scalarField, tagKey, unpackTlv } from '../../src/tlv/index.js';

describe('tlv pack', () => {
    const schema = [
        { tag: tagKey(0x0018), schema: [scalarField('x', 'uint16')] },
        { tag: tagKey(0x0102), schema: [bytesField('y', 'uint16')] },
    ];

    it('round-trips tagged packets', () => {
        const data = {
            [tagKey(0x0018)]: { x: 5 },
            [tagKey(0x0102)]: { y: Buffer.from([1, 2]) },
        };
        const unpacked = unpackTlv(schema, packTlv(schema, data));
        expect(unpacked[tagKey(0x0018)]).toEqual({ x: 5 });
        const y = (unpacked[tagKey(0x0102)] as { y: Buffer }).y;
        expect(y.equals(Buffer.from([1, 2]))).toBe(true);
    });

    it('keeps tags missing from the unpack schema as raw buffers', () => {
        const packed = packTlv(
            [
                { tag: tagKey(0x0018), schema: [scalarField('x', 'uint16')] },
                { tag: tagKey(0x0999), schema: [bytesField('z', 'uint8')] },
            ],
            { [tagKey(0x0018)]: { x: 1 }, [tagKey(0x0999)]: { z: Buffer.from([7, 7]) } },
        );
        const unpacked = unpackTlv(schema, packed);
        expect(Buffer.isBuffer(unpacked[tagKey(0x0999)])).toBe(true);
    });
});
