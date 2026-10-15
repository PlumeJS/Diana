import { unzipSync } from 'node:zlib';
import { DianaError, ErrorCode } from '../common/errors.js';
import { decryptTea, encryptTea } from '../crypto/tea.js';
import { decodeTlv, encodeTlv } from '../tlv/index.js';
import type { TlvData } from '../tlv/index.js';
import {
    CompressionType,
    EncryptionType,
    HEADER_CONST_1,
    HEADER_CONST_2,
    incomingSsoPacketSchema,
    incomingSsoPacketWrapperSchema,
    outgoingSsoHeaderSchema,
    outgoingSsoPacketSchema,
    outgoingSsoPacketWrapperSchema,
    SSO_PROTOCOL,
} from './sso.js';

/** 空 TEA 密钥，用于未登录阶段的加密。 */
export const EMPTY_TEA_KEY = Buffer.alloc(16);

const DEFAULT_LOCALE = 2052;

/** 出站包头参数。 */
export interface SsoHeaderInput {
    /** 序列号。 */
    sequence: number;
    /** 子 AppId。 */
    subAppId: number;
    /** 会话 a2 令牌。 */
    a2: Buffer;
    /** 命令字。 */
    command: string;
    /** 设备 guid（十六进制字符串）。 */
    guid: string;
    /** 客户端版本号。 */
    version: string;
    /** 预留字段（protobuf 序列化结果，可省略）。 */
    ssoReserveFields?: Buffer;
    /** 语言区域，默认 2052。 */
    locale?: number;
}

/** 编码出站 SSO 包的参数。 */
export interface EncodeSsoPacketOptions {
    header: SsoHeaderInput;
    /** 业务包体。 */
    body: Buffer;
    /** 会话 uin（字符串形式）。 */
    uin: string;
    /** 会话 d2。 */
    d2: Buffer;
    /** 会话 d2Key，为空时使用空密钥加密。 */
    d2Key: Buffer;
    /** 加密方式；缺省时按会话 d2 自动选择。 */
    encryption?: EncryptionType;
}

/** 解码后的入站包。 */
export type IncomingSsoPacket =
    | { command: string; sequence: number; body: Buffer }
    | { command: string; sequence: number; retcode: number; extra: string };

/** 编码一个完整的出站 SSO 包。 */
export function encodeSsoPacket(options: EncodeSsoPacketOptions): Buffer {
    const { header, body, uin, d2, d2Key } = options;
    const encryptionType =
        options.encryption ?? (d2.length > 0 && d2Key.length > 0 ? EncryptionType.TeaByD2Key : EncryptionType.TeaByEmptyKey);
    const key = encryptionType === EncryptionType.TeaByD2Key ? d2Key : EMPTY_TEA_KEY;

    const inner = encodeTlv(outgoingSsoPacketSchema, {
        header: {
            sequence: header.sequence,
            subAppId: header.subAppId,
            locale: header.locale ?? DEFAULT_LOCALE,
            const1: HEADER_CONST_1,
            a2: header.a2,
            command: header.command,
            const2: HEADER_CONST_2,
            guid: header.guid,
            const3: HEADER_CONST_2,
            version: header.version,
            ssoReserveFields: header.ssoReserveFields ?? Buffer.alloc(0),
        } satisfies TlvData,
        body,
    });

    return encodeTlv(outgoingSsoPacketWrapperSchema, {
        protocol: SSO_PROTOCOL,
        encryptionType,
        d2: encryptionType === EncryptionType.TeaByD2Key ? d2 : Buffer.alloc(0),
        flag3: 0,
        uin,
        encrypted: encryptionType === EncryptionType.None ? inner : encryptTea(inner, key),
    });
}

/** 解码一个完整的入站 SSO 包。 */
export function decodeSsoPacket(packet: Buffer, d2Key: Buffer): IncomingSsoPacket {
    const wrapper = decodeTlv(incomingSsoPacketWrapperSchema, packet);
    const protocol = wrapper['protocol'] as number;
    if (protocol !== SSO_PROTOCOL) {
        throw new DianaError(ErrorCode.Protocol, `不支持的 SSO 协议版本: ${protocol}`);
    }

    const decrypted = decryptByType(wrapper['encryptionType'] as EncryptionType, wrapper['packet'] as Buffer, d2Key);

    const parsed = decodeTlv(incomingSsoPacketSchema, decrypted);
    const header = parsed['header'] as TlvData;
    const command = header['command'] as string;
    const sequence = header['sequence'] as number;
    const retcode = header['retcode'] as number;

    if (retcode !== 0) {
        return { command, sequence, retcode, extra: header['extra'] as string };
    }

    const raw = parsed['raw'] as Buffer;
    return { command, sequence, body: decompress(header['compressionType'] as CompressionType, raw) };
}

/** 编码出站包头的辅助函数，供测试或构造使用。 */
export function encodeSsoHeader(header: SsoHeaderInput): Buffer {
    return encodeTlv(outgoingSsoHeaderSchema, {
        sequence: header.sequence,
        subAppId: header.subAppId,
        locale: header.locale ?? DEFAULT_LOCALE,
        const1: HEADER_CONST_1,
        a2: header.a2,
        command: header.command,
        const2: HEADER_CONST_2,
        guid: header.guid,
        const3: HEADER_CONST_2,
        version: header.version,
        ssoReserveFields: header.ssoReserveFields ?? Buffer.alloc(0),
    } satisfies TlvData);
}

function decryptByType(type: EncryptionType, data: Buffer, d2Key: Buffer): Buffer {
    switch (type) {
        case EncryptionType.None:
            return data;
        case EncryptionType.TeaByD2Key:
            return decryptTea(data, d2Key);
        case EncryptionType.TeaByEmptyKey:
            return decryptTea(data, EMPTY_TEA_KEY);
        default:
            throw new DianaError(ErrorCode.Protocol, `不支持的 SSO 加密类型: ${type}`);
    }
}

function decompress(type: CompressionType, data: Buffer): Buffer {
    switch (type) {
        case CompressionType.None:
        case CompressionType.None2:
            return data;
        case CompressionType.Zlib:
            return unzipSync(data);
        default:
            throw new DianaError(ErrorCode.Protocol, `不支持的 SSO 压缩类型: ${type}`);
    }
}
