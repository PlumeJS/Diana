import { BytesReader, BytesWriter } from '../util/bytes.js';
import { decodeTlv, encodeTlv } from './codec.js';
import type { TlvData, TlvSchema } from './types.js';

/** TLV 包的 tag，形如 `0x0018`。 */
export type TlvTag = `0x${string}`;

/** 带 tag 的 TLV 包定义。 */
export interface TaggedTlv {
    tag: TlvTag;
    schema: TlvSchema;
}

/** 由 tag 生成规范化的十六进制键。 */
export function tagKey(tag: number): TlvTag {
    return `0x${tag.toString(16).padStart(4, '0')}`;
}

/**
 * 将多个 TLV 包组装为一个包。
 * 结构：`count(uint16) + [tag(uint16) + length(uint16) + body]...`；未提供数据的 tag 会被跳过。
 */
export function packTlv(schema: readonly TaggedTlv[], data: Record<string, TlvData> = {}): Buffer {
    const writer = new BytesWriter();
    writer.writeUInt16BE(0); // 先占位，最后回填
    let count = 0;
    for (const { tag, schema: fieldSchema } of schema) {
        const value = data[tag];
        if (value === undefined) {
            continue;
        }
        const body = encodeTlv(fieldSchema, value);
        writer.writeUInt16BE(Number.parseInt(tag, 16));
        writer.writeUInt16BE(body.length);
        writer.writeBuffer(body);
        count += 1;
    }
    const output = writer.toBuffer();
    output.writeUInt16BE(count, 0);
    return output;
}

/**
 * 将单个 TLV 包拆解为以 tag 为键的数据；schema 中声明的 tag 使用其自身字符串作为键，未声明的以原始 Buffer 保留。
 */
export function unpackTlv(schema: readonly TaggedTlv[], buffer: Buffer): Record<string, unknown> {
    const reader = new BytesReader(buffer);
    const count = reader.readUInt16BE();
    const schemaByTag = new Map<number, TaggedTlv>(schema.map((item) => [Number.parseInt(item.tag, 16), item]));
    const result: Record<string, unknown> = {};
    for (let i = 0; i < count; i++) {
        const tag = reader.readUInt16BE();
        const length = reader.readUInt16BE();
        const body = reader.readBuffer(length);
        const entry = schemaByTag.get(tag);
        result[entry ? entry.tag : tagKey(tag)] = entry ? decodeTlv(entry.schema, body) : body;
    }
    return result;
}
