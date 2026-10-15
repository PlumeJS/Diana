import { DianaError, ErrorCode } from '../common/errors.js';
import { BytesReader, BytesWriter } from '../util/bytes.js';
import type { TlvData, TlvField, TlvLengthPrefix, TlvScalarType, TlvSchema } from './types.js';

const PREFIX_SIZE: Record<TlvLengthPrefix, number> = { none: 0, uint8: 1, uint16: 2, uint32: 4 };

function writeLength(writer: BytesWriter, prefix: TlvLengthPrefix, length: number): void {
    switch (prefix) {
        case 'uint8':
            writer.writeUInt8(length);
            break;
        case 'uint16':
            writer.writeUInt16BE(length);
            break;
        case 'uint32':
            writer.writeUInt32BE(length);
            break;
        case 'none':
            break;
    }
}

function readLength(reader: BytesReader, prefix: TlvLengthPrefix): number {
    switch (prefix) {
        case 'uint8':
            return reader.readUInt8();
        case 'uint16':
            return reader.readUInt16BE();
        case 'uint32':
            return reader.readUInt32BE();
        case 'none':
            return reader.remaining;
    }
}

function writeScalar(writer: BytesWriter, type: TlvScalarType, value: unknown): void {
    switch (type) {
        case 'uint8':
            writer.writeUInt8(value as number);
            break;
        case 'int8':
            writer.writeInt8(value as number);
            break;
        case 'uint16':
            writer.writeUInt16BE(value as number);
            break;
        case 'int16':
            writer.writeInt16BE(value as number);
            break;
        case 'uint32':
            writer.writeUInt32BE(value as number);
            break;
        case 'int32':
            writer.writeInt32BE(value as number);
            break;
        case 'uint64':
            writer.writeBigUInt64BE(value as bigint);
            break;
        case 'int64':
            writer.writeBigInt64BE(value as bigint);
            break;
        case 'float':
            writer.writeFloatBE(value as number);
            break;
        case 'double':
            writer.writeDoubleBE(value as number);
            break;
    }
}

function readScalar(reader: BytesReader, type: TlvScalarType): number | bigint {
    switch (type) {
        case 'uint8':
            return reader.readUInt8();
        case 'int8':
            return reader.readInt8();
        case 'uint16':
            return reader.readUInt16BE();
        case 'int16':
            return reader.readInt16BE();
        case 'uint32':
            return reader.readUInt32BE();
        case 'int32':
            return reader.readInt32BE();
        case 'uint64':
            return reader.readBigUInt64BE();
        case 'int64':
            return reader.readBigInt64BE();
        case 'float':
            return reader.readFloatBE();
        case 'double':
            return reader.readDoubleBE();
    }
}

function asBuffer(value: unknown, name: string): Buffer {
    if (!Buffer.isBuffer(value)) {
        throw new DianaError(ErrorCode.Validation, `TLV 字段 ${name} 的值必须为 Buffer`);
    }
    return value;
}

function lengthOf(prefix: TlvLengthPrefix, actual: number, includesPrefix: boolean): number {
    return includesPrefix ? actual + PREFIX_SIZE[prefix] : actual;
}

function actualLength(prefix: TlvLengthPrefix, read: number, includesPrefix: boolean): number {
    return includesPrefix ? read - PREFIX_SIZE[prefix] : read;
}

/** 序列化 TLV 数据。 */
export function encodeTlv(schema: TlvSchema, data: TlvData = {}): Buffer {
    const writer = new BytesWriter();
    for (const field of schema) {
        encodeField(writer, field, data[field.name]);
    }
    return writer.toBuffer();
}

function encodeField(writer: BytesWriter, field: TlvField, value: unknown): void {
    switch (field.kind) {
        case 'scalar':
            writeScalar(writer, field.type, value);
            break;
        case 'fixed':
            writer.writeBuffer(asBuffer(value, field.name));
            break;
        case 'bytes': {
            const buffer = asBuffer(value, field.name);
            writeLength(writer, field.lengthPrefix, lengthOf(field.lengthPrefix, buffer.length, field.lengthIncludesPrefix));
            writer.writeBuffer(buffer);
            break;
        }
        case 'string': {
            const buffer = Buffer.from(String(value ?? ''), 'utf8');
            writeLength(writer, field.lengthPrefix, lengthOf(field.lengthPrefix, buffer.length, field.lengthIncludesPrefix));
            writer.writeBuffer(buffer);
            break;
        }
        case 'nested': {
            const inner = encodeTlv(field.schema(), value as TlvData);
            writeLength(writer, field.lengthPrefix, lengthOf(field.lengthPrefix, inner.length, field.lengthIncludesPrefix));
            writer.writeBuffer(inner);
            break;
        }
    }
}

/** 反序列化 TLV 数据。 */
export function decodeTlv(schema: TlvSchema, buffer: Buffer): TlvData {
    const reader = new BytesReader(buffer);
    const data: TlvData = {};
    for (const field of schema) {
        data[field.name] = decodeField(reader, field);
    }
    return data;
}

function decodeField(reader: BytesReader, field: TlvField): unknown {
    switch (field.kind) {
        case 'scalar':
            return readScalar(reader, field.type);
        case 'fixed':
            return reader.readBuffer(field.length);
        case 'bytes': {
            const length = actualLength(field.lengthPrefix, readLength(reader, field.lengthPrefix), field.lengthIncludesPrefix);
            return reader.readBuffer(length);
        }
        case 'string': {
            const length = actualLength(field.lengthPrefix, readLength(reader, field.lengthPrefix), field.lengthIncludesPrefix);
            return reader.readBuffer(length).toString('utf8');
        }
        case 'nested': {
            const length = actualLength(field.lengthPrefix, readLength(reader, field.lengthPrefix), field.lengthIncludesPrefix);
            return decodeTlv(field.schema(), reader.readBuffer(length));
        }
    }
}
