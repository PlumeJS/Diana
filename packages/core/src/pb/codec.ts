import { DianaError, ErrorCode } from '../common/errors.js';
import { ScalarType, WireType } from './types.js';

/** 标量类型到线类型的映射。 */
export const ScalarTypeToWireType: Record<ScalarType, WireType> = {
    [ScalarType.DOUBLE]: WireType.Fixed64,
    [ScalarType.FLOAT]: WireType.Fixed32,
    [ScalarType.INT64]: WireType.Varint,
    [ScalarType.UINT64]: WireType.Varint,
    [ScalarType.INT32]: WireType.Varint,
    [ScalarType.FIXED64]: WireType.Fixed64,
    [ScalarType.FIXED32]: WireType.Fixed32,
    [ScalarType.BOOL]: WireType.Varint,
    [ScalarType.STRING]: WireType.LengthDelimited,
    [ScalarType.BYTES]: WireType.LengthDelimited,
    [ScalarType.UINT32]: WireType.Varint,
    [ScalarType.SFIXED32]: WireType.Fixed32,
    [ScalarType.SFIXED64]: WireType.Fixed64,
    [ScalarType.SINT32]: WireType.Varint,
    [ScalarType.SINT64]: WireType.Varint,
};

/** 可增长的小端字节写入器，用于 protobuf 编码。 */
export class ProtoWriter {
    private buffer: Buffer = Buffer.allocUnsafe(64);
    private cursor = 0;

    private ensure(size: number): void {
        const required = this.cursor + size;
        if (required <= this.buffer.length) {
            return;
        }
        let capacity = this.buffer.length * 2;
        while (capacity < required) {
            capacity *= 2;
        }
        const next = Buffer.allocUnsafe(capacity);
        this.buffer.copy(next, 0, 0, this.cursor);
        this.buffer = next;
    }

    /** 写入单个字节。 */
    byte(value: number): void {
        this.ensure(1);
        this.cursor = this.buffer.writeUInt8(value, this.cursor);
    }

    /** 写入无符号 varint（负数按 64 位补码处理）。 */
    varint(value: bigint): void {
        let remaining = value < 0n ? value + (1n << 64n) : value;
        while (remaining > 0x7fn) {
            this.byte(Number((remaining & 0x7fn) | 0x80n));
            remaining >>= 7n;
        }
        this.byte(Number(remaining));
    }

    /** 写入 32 位定长（小端）。 */
    fixed32(value: number): void {
        this.ensure(4);
        this.cursor = this.buffer.writeUInt32LE(value >>> 0, this.cursor);
    }

    /** 写入 64 位定长（小端）。 */
    fixed64(value: bigint): void {
        this.ensure(8);
        this.cursor = this.buffer.writeBigUInt64LE(BigInt.asUintN(64, value), this.cursor);
    }

    /** 写入单精度浮点（小端）。 */
    float(value: number): void {
        this.ensure(4);
        this.cursor = this.buffer.writeFloatLE(value, this.cursor);
    }

    /** 写入双精度浮点（小端）。 */
    double(value: number): void {
        this.ensure(8);
        this.cursor = this.buffer.writeDoubleLE(value, this.cursor);
    }

    /** 写入原始字节。 */
    raw(value: Buffer): void {
        this.ensure(value.length);
        this.cursor += value.copy(this.buffer, this.cursor);
    }

    /** 输出已写入的字节。 */
    build(): Buffer {
        return Buffer.from(this.buffer.subarray(0, this.cursor));
    }
}

/** protobuf 读取器。 */
export class ProtoReader {
    private cursor = 0;

    constructor(private readonly buffer: Buffer) {}

    /** 确认剩余字节足够，避免越界。 */
    private ensure(size: number): void {
        if (this.cursor + size > this.buffer.length) {
            throw new DianaError(
                ErrorCode.Protocol,
                `protobuf 数据不完整 (offset=${this.cursor}, size=${size}, length=${this.buffer.length})`,
            );
        }
    }

    /** 读取字段标签。 */
    readTag(): { fieldNumber: number; wireType: WireType } {
        const tag = Number(this.varint());
        return { fieldNumber: tag >>> 3, wireType: (tag & 0x07) as WireType };
    }

    /** 读取无符号 varint。 */
    varint(): bigint {
        let result = 0n;
        let shift = 0n;
        for (;;) {
            this.ensure(1);
            const byte = this.buffer.readUInt8(this.cursor);
            this.cursor += 1;
            result |= BigInt(byte & 0x7f) << shift;
            if ((byte & 0x80) === 0) {
                break;
            }
            shift += 7n;
        }
        return result;
    }

    /** 读取 32 位定长（小端）。 */
    fixed32(): number {
        this.ensure(4);
        const value = this.buffer.readUInt32LE(this.cursor);
        this.cursor += 4;
        return value;
    }

    /** 读取 64 位定长（小端）。 */
    fixed64(): bigint {
        this.ensure(8);
        const value = this.buffer.readBigUInt64LE(this.cursor);
        this.cursor += 8;
        return value;
    }

    /** 读取单精度浮点（小端）。 */
    float(): number {
        this.ensure(4);
        const value = this.buffer.readFloatLE(this.cursor);
        this.cursor += 4;
        return value;
    }

    /** 读取双精度浮点（小端）。 */
    double(): number {
        this.ensure(8);
        const value = this.buffer.readDoubleLE(this.cursor);
        this.cursor += 8;
        return value;
    }

    /** 读取长度前缀字段。 */
    lengthDelimited(): Buffer {
        const length = Number(this.varint());
        this.ensure(length);
        const value = this.buffer.subarray(this.cursor, this.cursor + length);
        this.cursor += length;
        return value;
    }

    /** 跳过未知或类型不符的字段。 */
    skip(wireType: WireType): void {
        switch (wireType) {
            case WireType.Varint:
                this.varint();
                break;
            case WireType.Fixed64:
                this.ensure(8);
                this.cursor += 8;
                break;
            case WireType.Fixed32:
                this.ensure(4);
                this.cursor += 4;
                break;
            case WireType.LengthDelimited:
                this.lengthDelimited();
                break;
            default:
                throw new DianaError(ErrorCode.Protocol, `不支持的 protobuf 线类型: ${wireType}`);
        }
    }

    /** 当前读取位置。 */
    get position(): number {
        return this.cursor;
    }
}
