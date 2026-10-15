import type { AppInfo } from '../common/app-info.js';
import { DianaError, ErrorCode } from '../common/errors.js';
import type { Ecdh } from '../crypto/ecdh.js';
import { decryptTea, encryptTea } from '../crypto/tea.js';
import { wtLoginResponseBaseSchema } from '../packet/login/index.js';
import { decodeTlv } from '../tlv/index.js';
import { BytesReader, BytesWriter } from '../util/bytes.js';
import { timestamp } from '../util/format.js';
import type { Keystore } from './keystore.js';

/** wtlogin 主命令字。 */
export type WtLoginCommand = 'wtlogin.login' | 'wtlogin.trans_emp';

/** 解码后的 wtlogin 响应。 */
export interface DecodedWtLoginPacket {
    internalLength: number;
    version: number;
    commandId: number;
    sequence: number;
    uin: number;
    flag: number;
    retryTime: number;
    decrypted: Buffer;
}

/** wtlogin 包的构造与解析。 */
export class WtLoginLogic {
    constructor(
        private readonly appInfo: AppInfo,
        private readonly keystore: Keystore,
        private readonly ecdh192: Ecdh,
    ) {}

    /** 构造 wtlogin 请求包。 */
    buildPacket(command: WtLoginCommand, data: Buffer): Buffer {
        const encrypted = encryptTea(data, this.ecdh192.shareKey);

        const body = new BytesWriter()
            .writeUInt16BE(8001) // version
            .writeUInt16BE(command === 'wtlogin.login' ? 2064 : 2066)
            .writeUInt16BE(0) // 序列号，登录前固定为 0
            .writeUInt32BE(this.keystore.uin)
            .writeUInt8(3) // extVer
            .writeUInt8(135) // cmdVer
            .writeUInt32BE(0)
            .writeUInt8(19) // pubId
            .writeUInt16BE(0) // insId
            .writeUInt16BE(this.appInfo.AppClientVersion)
            .writeUInt32BE(0) // retryTime
            // 加密头
            .writeUInt8(1)
            .writeUInt8(1)
            .writeBuffer(Buffer.alloc(16))
            .writeUInt16BE(0x102)
            .writeUInt16BE(this.ecdh192.publicKey.length)
            .writeBuffer(this.ecdh192.publicKey)
            .writeBuffer(encrypted)
            .writeUInt8(3)
            .toBuffer();

        return new BytesWriter()
            .writeUInt8(0x02)
            .writeUInt16BE(body.length + 3)
            .writeBuffer(body)
            .toBuffer();
    }

    /** 构造 trans_emp 请求体。 */
    buildTransEmpBody(subCommand: number, tlv: Buffer): Buffer {
        const requestBody = new BytesWriter()
            .writeUInt32BE(timestamp())
            .writeUInt8(0x02)
            .writeUInt16BE(46 + tlv.length)
            .writeUInt16BE(subCommand)
            .writeBuffer(Buffer.alloc(21))
            .writeUInt8(0x03)
            .writeInt32BE(0x32) // 版本号 50
            .writeInt16BE(0)
            .writeUInt32BE(0)
            .writeBigUInt64BE(0n)
            .writeBuffer(tlv)
            .writeUInt8(0x03)
            .toBuffer();

        return new BytesWriter()
            .writeUInt8(0)
            .writeUInt16BE(requestBody.length)
            .writeUInt32BE(this.appInfo.AppId)
            .writeUInt32BE(0x72) // Role
            .writeBuffer(Buffer.alloc(3))
            .writeBuffer(requestBody)
            .toBuffer();
    }

    /** 解析 wtlogin 响应包。 */
    decodePacket(data: Buffer): DecodedWtLoginPacket {
        if (data[0] !== 0x02 || data[data.length - 1] !== 0x03) {
            throw new DianaError(ErrorCode.Protocol, '不合法的 wtlogin 包');
        }
        const parsed = decodeTlv(wtLoginResponseBaseSchema, data.subarray(1));
        const encrypted = parsed['encrypted'] as Buffer;
        if (encrypted[encrypted.length - 1] !== 0x03) {
            throw new DianaError(ErrorCode.Protocol, '不合法的终止字节');
        }
        return {
            internalLength: parsed['internalLength'] as number,
            version: parsed['version'] as number,
            commandId: parsed['commandId'] as number,
            sequence: parsed['sequence'] as number,
            uin: parsed['uin'] as number,
            flag: parsed['flag'] as number,
            retryTime: parsed['retryTime'] as number,
            decrypted: decryptTea(encrypted.subarray(0, -1), this.ecdh192.shareKey),
        };
    }

    /** 提取 trans_emp 响应体。 */
    unwrapTransEmp(data: Buffer): { subCommand: number; appId: number; body: Buffer } {
        const reader = new BytesReader(data);
        reader.readBuffer(8);
        const subCommand = reader.readUInt16BE();
        reader.readBuffer(40);
        const appId = reader.readUInt32BE();
        return { subCommand, appId, body: reader.readBuffer(reader.remaining) };
    }
}