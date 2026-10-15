import { DianaError, ErrorCode } from '../common/errors.js';
import { ProtoReader, ProtoWriter, ScalarTypeToWireType } from './codec.js';
import { ScalarType, WireType } from './types.js';
import type { InferProtoModel, InferProtoModelInput, ProtoFieldSpec, ProtoFieldType, ProtoModel } from './types.js';

function wireTypeOf(spec: ProtoFieldSpec): WireType {
    const type = spec.type;
    if (typeof type === 'function' || type === ScalarType.STRING || type === ScalarType.BYTES) {
        return WireType.LengthDelimited;
    }
    if (spec.repeated && spec.packed) {
        return WireType.LengthDelimited;
    }
    return ScalarTypeToWireType[type];
}

function isPackable(type: ProtoFieldType): type is ScalarType {
    return typeof type !== 'function' && type !== ScalarType.STRING && type !== ScalarType.BYTES;
}

/**
 * 判断字段声明的线类型与数据中的线类型是否兼容。
 * 重复标量允许以 LengthDelimited 出现（packed 编码）。
 */
function isWireTypeCompatible(spec: ProtoFieldSpec, wireType: WireType): boolean {
    const type = spec.type;
    if (typeof type === 'function' || type === ScalarType.STRING || type === ScalarType.BYTES) {
        return wireType === WireType.LengthDelimited;
    }
    return wireType === WireType.LengthDelimited ? spec.repeated : ScalarTypeToWireType[type] === wireType;
}

function zigzag32(value: number): number {
    return ((value << 1) ^ (value >> 31)) >>> 0;
}

function unzigzag32(value: number): number {
    return (value >>> 1) ^ -(value & 1);
}

function zigzag64(value: bigint): bigint {
    return (value << 1n) ^ (value >> 63n);
}

function unzigzag64(value: bigint): bigint {
    return (value >> 1n) ^ -(value & 1n);
}

function writeScalar(writer: ProtoWriter, type: ScalarType, value: unknown): void {
    switch (type) {
        case ScalarType.DOUBLE:
            writer.double(value as number);
            break;
        case ScalarType.FLOAT:
            writer.float(value as number);
            break;
        case ScalarType.INT64:
        case ScalarType.UINT64:
            writer.varint(value as bigint);
            break;
        case ScalarType.INT32:
        case ScalarType.UINT32:
            writer.varint(BigInt(value as number));
            break;
        case ScalarType.BOOL:
            writer.varint(value ? 1n : 0n);
            break;
        case ScalarType.SINT32:
            writer.varint(BigInt(zigzag32(value as number)));
            break;
        case ScalarType.SINT64:
            writer.varint(zigzag64(value as bigint));
            break;
        case ScalarType.FIXED32:
        case ScalarType.SFIXED32:
            writer.fixed32(value as number);
            break;
        case ScalarType.FIXED64:
        case ScalarType.SFIXED64:
            writer.fixed64(value as bigint);
            break;
        default:
            throw new DianaError(ErrorCode.Protocol, `不支持的 protobuf 标量类型: ${type}`);
    }
}

function readScalar(reader: ProtoReader, type: ScalarType): number | bigint | boolean {
    switch (type) {
        case ScalarType.DOUBLE:
            return reader.double();
        case ScalarType.FLOAT:
            return reader.float();
        case ScalarType.INT64:
            return BigInt.asIntN(64, reader.varint());
        case ScalarType.UINT64:
            return BigInt.asUintN(64, reader.varint());
        case ScalarType.INT32:
            return Number(BigInt.asIntN(32, reader.varint()));
        case ScalarType.UINT32:
            return Number(BigInt.asUintN(32, reader.varint()));
        case ScalarType.BOOL:
            return reader.varint() !== 0n;
        case ScalarType.SINT32:
            return unzigzag32(Number(reader.varint()));
        case ScalarType.SINT64:
            return unzigzag64(reader.varint());
        case ScalarType.FIXED32:
            return reader.fixed32();
        case ScalarType.SFIXED32:
            return reader.fixed32() | 0;
        case ScalarType.FIXED64:
            return reader.fixed64();
        case ScalarType.SFIXED64:
            return BigInt.asIntN(64, reader.fixed64());
        default:
            throw new DianaError(ErrorCode.Protocol, `不支持的 protobuf 标量类型: ${type}`);
    }
}

function defaultScalar(type: ScalarType): unknown {
    switch (type) {
        case ScalarType.BOOL:
            return false;
        case ScalarType.STRING:
            return '';
        case ScalarType.BYTES:
            return Buffer.alloc(0);
        case ScalarType.INT64:
        case ScalarType.UINT64:
        case ScalarType.FIXED64:
        case ScalarType.SFIXED64:
        case ScalarType.SINT64:
            return 0n;
        default:
            return 0;
    }
}

/** protobuf 消息编解码器。 */
export class ProtoMessage<const T extends ProtoModel> {
    private static readonly registry = new WeakMap<ProtoModel, ProtoMessage<ProtoModel>>();
    private readonly byNumber = new Map<number, [string, ProtoFieldSpec]>();

    private constructor(private readonly model: T) {
        for (const key of Object.keys(model)) {
            const spec = model[key]!;
            this.byNumber.set(spec.fieldNumber, [key, spec]);
        }
    }

    /** 获取（并缓存）消息模型对应的编解码器。 */
    static of<const M extends ProtoModel>(model: M): ProtoMessage<M> {
        const cached = ProtoMessage.registry.get(model);
        if (cached) {
            return cached as ProtoMessage<M>;
        }
        const message = new ProtoMessage(model);
        ProtoMessage.registry.set(model, message as ProtoMessage<ProtoModel>);
        return message;
    }

    /** 消息模型（字段定义），便于嵌套引用。 */
    get fields(): T {
        return this.model;
    }

    /** 编码消息。 */
    encode(input: InferProtoModelInput<T>): Buffer {
        const writer = new ProtoWriter();
        this.writeFields(writer, input as Record<string, unknown>);
        return writer.build();
    }

    /** 解码消息。 */
    decode(buffer: Buffer): InferProtoModel<T> {
        const draft: Record<string, unknown> = {};
        for (const key of Object.keys(this.model)) {
            const spec = this.model[key]!;
            const type = spec.type;
            if (spec.repeated) {
                draft[key] = [];
            } else if (!spec.optional && typeof type !== 'function') {
                draft[key] = defaultScalar(type);
            }
        }
        this.readFields(new ProtoReader(buffer), draft, buffer.length);
        return draft as InferProtoModel<T>;
    }

    private writeFields(writer: ProtoWriter, input: Record<string, unknown>): void {
        for (const key of Object.keys(this.model)) {
            const value = input[key];
            if (value === undefined) {
                continue;
            }
            this.writeField(writer, this.model[key]!, value);
        }
    }

    private writeField(writer: ProtoWriter, spec: ProtoFieldSpec, value: unknown): void {
        const tag = (spec.fieldNumber << 3) | wireTypeOf(spec);
        const type = spec.type;
        if (spec.repeated) {
            const items = value as unknown[];
            if (items.length === 0) {
                return;
            }
            if (spec.packed && isPackable(type)) {
                const inner = new ProtoWriter();
                for (const item of items) {
                    writeScalar(inner, type, item);
                }
                const body = inner.build();
                writer.varint(BigInt(tag));
                writer.varint(BigInt(body.length));
                writer.raw(body);
                return;
            }
            for (const item of items) {
                writer.varint(BigInt(tag));
                this.writeSingle(writer, spec, item);
            }
            return;
        }
        writer.varint(BigInt(tag));
        this.writeSingle(writer, spec, value);
    }

    private writeSingle(writer: ProtoWriter, spec: ProtoFieldSpec, value: unknown): void {
        const type = spec.type;
        if (typeof type === 'function') {
            // 已是编码结果时原样透传，避免解码-重编码丢失未建模字段
            const body = Buffer.isBuffer(value)
                ? value
                : ProtoMessage.of(type()).encode(value as InferProtoModelInput<ProtoModel>);
            writer.varint(BigInt(body.length));
            writer.raw(body);
            return;
        }
        if (type === ScalarType.STRING || type === ScalarType.BYTES) {
            const body = type === ScalarType.STRING ? Buffer.from(value as string, 'utf8') : (value as Buffer);
            writer.varint(BigInt(body.length));
            writer.raw(body);
            return;
        }
        writeScalar(writer, type, value);
    }

    private readFields(reader: ProtoReader, draft: Record<string, unknown>, limit: number): void {
        while (reader.position < limit) {
            const { fieldNumber, wireType } = reader.readTag();
            const entry = this.byNumber.get(fieldNumber);
            if (!entry) {
                reader.skip(wireType);
                continue;
            }
            this.readField(reader, draft, entry[0], entry[1], wireType);
        }
    }

    private readField(
        reader: ProtoReader,
        draft: Record<string, unknown>,
        key: string,
        spec: ProtoFieldSpec,
        wireType: WireType,
    ): void {
        // 线类型与声明不符时按未知字段跳过，避免错位后续解析
        if (!isWireTypeCompatible(spec, wireType)) {
            reader.skip(wireType);
            return;
        }
        if (spec.repeated) {
            const list = (draft[key] ??= []) as unknown[];
            const type = spec.type;
            if (isPackable(type) && wireType === WireType.LengthDelimited) {
                const body = reader.lengthDelimited();
                const inner = new ProtoReader(body);
                while (inner.position < body.length) {
                    list.push(readScalar(inner, type));
                }
            } else {
                list.push(this.readSingle(reader, spec));
            }
            return;
        }
        draft[key] = this.readSingle(reader, spec);
    }

    private readSingle(reader: ProtoReader, spec: ProtoFieldSpec): unknown {
        const type = spec.type;
        if (typeof type === 'function') {
            return ProtoMessage.of(type()).decode(reader.lengthDelimited());
        }
        if (type === ScalarType.STRING) {
            return reader.lengthDelimited().toString('utf8');
        }
        if (type === ScalarType.BYTES) {
            return reader.lengthDelimited();
        }
        return readScalar(reader, type);
    }
}
