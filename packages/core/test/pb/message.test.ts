import { describe, expect, it } from 'vitest';
import { DianaError } from '../../src/common/errors.js';
import { ProtoField, ProtoMessage, ScalarType } from '../../src/pb/index.js';

const Inner = {
    value: ProtoField(1, ScalarType.UINT32),
};

const Model = {
    active: ProtoField(1, ScalarType.BOOL),
    count: ProtoField(2, ScalarType.INT32),
    big: ProtoField(3, ScalarType.INT64),
    name: ProtoField(4, ScalarType.STRING, { optional: true }),
    blob: ProtoField(5, ScalarType.BYTES, { optional: true }),
    ratio: ProtoField(6, ScalarType.DOUBLE),
    sint: ProtoField(7, ScalarType.SINT32),
    ids: ProtoField(8, ScalarType.UINT32, { repeated: true }),
    tags: ProtoField(9, ScalarType.STRING, { repeated: true }),
    inner: ProtoField(10, () => Inner, { optional: true }),
    innerList: ProtoField(11, () => Inner, { repeated: true }),
};

const message = ProtoMessage.of(Model);

describe('pb message', () => {
    it('round-trips scalar, repeated and nested fields', () => {
        const decoded = message.decode(
            message.encode({
                active: true,
                count: -5,
                big: -1234567890123n,
                name: 'diana',
                blob: Buffer.from([1, 2, 3]),
                ratio: 1.5,
                sint: -42,
                ids: [1, 2, 300],
                tags: ['a', 'b'],
                inner: { value: 7 },
                innerList: [{ value: 1 }, { value: 2 }],
            }),
        );

        expect(decoded.active).toBe(true);
        expect(decoded.count).toBe(-5);
        expect(decoded.big).toBe(-1234567890123n);
        expect(decoded.name).toBe('diana');
        expect(decoded.blob?.equals(Buffer.from([1, 2, 3]))).toBe(true);
        expect(decoded.ratio).toBeCloseTo(1.5);
        expect(decoded.sint).toBe(-42);
        expect(decoded.ids).toEqual([1, 2, 300]);
        expect(decoded.tags).toEqual(['a', 'b']);
        expect(decoded.inner).toEqual({ value: 7 });
        expect(decoded.innerList).toEqual([{ value: 1 }, { value: 2 }]);
    });

    it('round-trips negative 32/64-bit integers', () => {
        const decoded = message.decode(message.encode({ count: -1, big: -1n }));
        expect(decoded.count).toBe(-1);
        expect(decoded.big).toBe(-1n);
    });

    it('skips unknown fields', () => {
        const encoded = message.encode({ count: -5 });
        const unknownField = Buffer.from([0x98, 0x06, 0x01]); // 字段 99，varint 值 1
        expect(message.decode(Buffer.concat([encoded, unknownField])).count).toBe(-5);
    });

    it('线类型不匹配的字段被跳过且不错位', () => {
        const data = Buffer.concat([
            Buffer.from([0x12, 0x02, 0xaa, 0xbb]), // 字段 2 声明为 INT32，实际以 LengthDelimited 出现
            message.encode({ big: 9n }),
        ]);
        const decoded = message.decode(data);
        expect(decoded.count).toBe(0);
        expect(decoded.big).toBe(9n);
    });

    it('数据截断时抛出协议错误', () => {
        expect(() => message.decode(Buffer.from([0x12, 0x05, 0x61]))).toThrow(DianaError);
        expect(() => message.decode(Buffer.from([0x18, 0x80]))).toThrow(DianaError);
    });

    it('applies proto3 defaults for absent scalar fields', () => {
        const decoded = message.decode(Buffer.alloc(0));
        expect(decoded.active).toBe(false);
        expect(decoded.count).toBe(0);
        expect(decoded.big).toBe(0n);
        expect(decoded.name).toBeUndefined();
        expect(decoded.ids).toEqual([]);
    });
});
