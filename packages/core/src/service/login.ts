import type { AppInfo } from '../common/app-info.js';
import type { DeviceInfo } from '../common/device-info.js';
import { DianaError, ErrorCode } from '../common/errors.js';
import { createLogger } from '../common/logger.js';
import type { Logger } from '../common/logger.js';
import type { Ecdh } from '../crypto/ecdh.js';
import { decryptTea, encryptTea } from '../crypto/tea.js';
import {
    LoginState,
    login0x119Pack,
    login0x144Pack,
    login0x543Body,
    loginPack,
    loginResponsePack,
    loginResponseSchema,
    QrCodeState,
    qrConfirmPack,
    qrFetchPack,
    qrFetchResponsePack,
    qrcode0xd1Body,
    qrcode0xd1Response,
    transEmp12ConfirmedSchema,
    transEmp12ResponseSchema,
    transEmp31ResponseSchema,
    transEmp31Schema,
} from '../packet/login/index.js';
import { decodeTlv, encodeTlv, packTlv, unpackTlv } from '../tlv/index.js';
import type { TlvData } from '../tlv/index.js';
import { BytesWriter } from '../util/bytes.js';
import type { Keystore } from './keystore.js';
import type { SsoTransport } from './transport.js';
import { WtLoginLogic } from './wtlogin.js';

const FETCH_QR_SUB_COMMAND = 0x31;
const QUERY_QR_SUB_COMMAND = 0x12;
const MIN_QUERY_INTERVAL = 2000;

/** 登录时通过 TLV 0x511 登记的 pskey 域名列表，对齐 Lagrange 的 Tlv511。 */
const PSKEY_DOMAINS = [
    'qq.com',
    'office.qq.com',
    'qun.qq.com',
    'gamecenter.qq.com',
    'docs.qq.com',
    'mail.qq.com',
    'tim.qq.com',
    'ti.qq.com',
    'vip.qq.com',
    'tenpay.com',
    'qqweb.qq.com',
    'qzone.qq.com',
    'mma.qq.com',
    'game.qq.com',
    'openmobile.qq.com',
    'connect.qq.com',
] as const;

/** 编码 0x511 域名条目：每个条目为 1 字节标志（0x01）+ uint16 长度前缀的域名。 */
function encodePskeyDomains(domains: readonly string[]): Buffer {
    const writer = new BytesWriter();
    for (const domain of domains) {
        writer.writeUInt8(1);
        writer.writeUInt16BE(Buffer.byteLength(domain));
        writer.writeBuffer(Buffer.from(domain));
    }
    return writer.toBuffer();
}

/** 二维码信息。 */
export interface QrCodeInfo {
    /** 二维码图片数据。 */
    qrCode: Buffer;
    /** 过期时间（秒）。 */
    expiration: number;
    /** 登录 URL。 */
    url: string;
    /** 二维码签名串。 */
    qrSig: string;
    /** 签名。 */
    signature: Buffer;
}

/** 二维码轮询结果。 */
export type QrCodeQueryResult = { confirmed: true } | { confirmed: false; state: QrCodeState };

/** 登录结果。 */
export type LoginResult =
    | { success: true; uid: string }
    | { success: false; state: LoginState; tag?: string; message?: string };

/** 登录服务所需的上下文。 */
export interface LoginContext {
    appInfo: AppInfo;
    deviceInfo: DeviceInfo;
    transport: SsoTransport;
    keystore: Keystore;
    ecdh192: Ecdh;
}

/** 二维码登录流程。 */
export class LoginService {
    private readonly wtlogin: WtLoginLogic;
    private readonly logger: Logger;
    private resolvedUin?: number;

    constructor(private readonly ctx: LoginContext) {
        this.wtlogin = new WtLoginLogic(ctx.appInfo, ctx.keystore, ctx.ecdh192);
        this.logger = createLogger('LoginService');
    }

    /** 完整的二维码登录：获取二维码 → 轮询确认 → 提交登录。 */
    async qrCodeLogin(interval = 5000, signal?: AbortSignal): Promise<void> {
        await this.fetchQrCode();
        await this.waitForQrConfirm(interval, signal);
        this.ctx.keystore.uin = await this.resolveUin();
        const result = await this.login();
        if (!result.success) {
            throw new DianaError(
                ErrorCode.Login,
                `登录失败 (state=${result.state}, tag=${result.tag}, message=${result.message})`,
            );
        }
    }

    /** 获取二维码。 */
    async fetchQrCode(): Promise<QrCodeInfo> {
        const { appInfo, deviceInfo } = this.ctx;
        const tlvPack = packTlv(qrFetchPack, {
            '0x16': {
                field0: 0,
                appId: appInfo.AppId,
                appIdQrCode: appInfo.AppIdQrCode,
                guid: deviceInfo.guid,
                packageName: appInfo.PackageName,
                ptVersion: appInfo.PtVersion,
                packageName2: appInfo.PackageName,
            },
            '0x1b': { micro: 0, version: 0, size: 3, margin: 4, dpi: 72, ecLevel: 2, hint: 2, field7: 0 },
            '0x1d': { field0: 1, miscBitmap: appInfo.MainSigMap, field2: 0, field3: 0 },
            '0x33': { guid: deviceInfo.guid },
            '0x35': { ptOsVersion: appInfo.SsoVersion },
            '0x66': { ptOsVersion: appInfo.SsoVersion },
            '0xd1': {
                body: qrcode0xd1Body.encode({
                    system: { os: appInfo.Os, name: deviceInfo.deviceName },
                    type: Buffer.from([0x30, 0x01]),
                }),
            },
        });

        const body = encodeTlv(transEmp31Schema, {
            appId: appInfo.AppId,
            uin: BigInt(this.ctx.keystore.uin),
            a2: this.ctx.keystore.session.a2 ?? Buffer.alloc(0),
            field4: 0,
            field5: 0,
            tlvPack,
        });

        const data = await this.call(
            'wtlogin.trans_emp',
            this.wtlogin.buildPacket('wtlogin.trans_emp', this.wtlogin.buildTransEmpBody(FETCH_QR_SUB_COMMAND, body)),
        );
        const decoded = this.wtlogin.decodePacket(data);
        const resolved = this.wtlogin.unwrapTransEmp(decoded.decrypted);
        if (resolved.subCommand !== FETCH_QR_SUB_COMMAND) {
            throw new DianaError(ErrorCode.Login, `意外的 sub command: ${resolved.subCommand}`);
        }

        const response = decodeTlv(transEmp31ResponseSchema, resolved.body);
        const tlv = unpackTlv(qrFetchResponsePack, response['tlvPack'] as Buffer);
        const d1 = qrcode0xd1Response.decode((tlv['0xd1'] as TlvData)['body'] as Buffer);

        const info: QrCodeInfo = {
            qrCode: (tlv['0x17'] as TlvData)['qrCode'] as Buffer,
            expiration: (tlv['0x1c'] as TlvData)['expirationInSec'] as number,
            url: d1.url,
            qrSig: d1.qrSig,
            signature: response['signature'] as Buffer,
        };

        this.ctx.keystore.session.qrSign = info.signature;
        this.ctx.keystore.session.qrString = info.qrSig;
        this.ctx.keystore.session.qrUrl = info.url;
        return info;
    }

    /** 查询一次二维码状态。 */
    async queryQrCode(): Promise<QrCodeQueryResult> {
        const { qrSign } = this.ctx.keystore.session;
        const body = new BytesWriter()
            .writeUInt32BE(this.ctx.appInfo.AppId)
            .writeUInt16BE(qrSign?.length ?? 0)
            .writeBuffer(qrSign ?? Buffer.alloc(0))
            .writeBigUInt64BE(BigInt(this.ctx.keystore.uin))
            .writeUInt32BE(0)
            .writeUInt8(0)
            .writeUInt8(0x03)
            .toBuffer();

        const data = await this.call(
            'wtlogin.trans_emp',
            this.wtlogin.buildPacket('wtlogin.trans_emp', this.wtlogin.buildTransEmpBody(QUERY_QR_SUB_COMMAND, body)),
        );
        const decoded = this.wtlogin.decodePacket(data);
        const resolved = this.wtlogin.unwrapTransEmp(decoded.decrypted);
        if (resolved.subCommand !== QUERY_QR_SUB_COMMAND) {
            throw new DianaError(ErrorCode.Login, `意外的 sub command: ${resolved.subCommand}`);
        }

        const response = decodeTlv(transEmp12ResponseSchema, resolved.body);
        const state = response['qrCodeState'] as QrCodeState;
        if (state !== QrCodeState.Confirmed) {
            return { confirmed: false, state };
        }

        const confirmed = decodeTlv(transEmp12ConfirmedSchema, response['remaining'] as Buffer);
        const tlv = unpackTlv(qrConfirmPack, confirmed['tlvPack'] as Buffer);
        this.ctx.keystore.session.a1 = (tlv['0x18'] as TlvData)['a1'] as Buffer;
        this.ctx.keystore.session.noPicSig = (tlv['0x19'] as TlvData)['noPicSig'] as Buffer;
        this.ctx.keystore.stub.tgtgtKey = (tlv['0x1e'] as TlvData)['tgtgtKey'] as Buffer;
        return { confirmed: true };
    }

    /** 轮询二维码状态，直到确认或过期/取消。 */
    async waitForQrConfirm(interval = 5000, signal?: AbortSignal): Promise<void> {
        const delay = Math.max(interval, MIN_QUERY_INTERVAL);
        for (;;) {
            if (signal?.aborted) {
                throw new DianaError(ErrorCode.Login, '登录已取消');
            }
            const result = await this.queryQrCode();
            if (result.confirmed) {
                return;
            }
            if (result.state === QrCodeState.CodeExpired) {
                throw new DianaError(ErrorCode.Login, '二维码已过期');
            }
            if (result.state === QrCodeState.Canceled) {
                throw new DianaError(ErrorCode.Login, '用户已取消登录');
            }
            this.logger.debug(`二维码状态：${QrCodeState[result.state]} (${result.state})`);
            if (result.state === QrCodeState.WaitingForConfirm) {
                const uin = await this.resolveUin().catch(() => undefined);
                if (uin !== undefined) {
                    this.logger.info(`二维码等待用户确认，登录用户：${uin}`);
                }
            }
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    /** 通过登录 URL 查询账号 uin。 */
    async resolveUin(): Promise<number> {
        if (this.resolvedUin !== undefined) {
            return this.resolvedUin;
        }
        const response = await fetch('https://ntlogin.qq.com/qr/getFace', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                appid: this.ctx.appInfo.AppId,
                faceUpdateTime: 0,
                qrsig: this.ctx.keystore.session.qrString,
            }),
        });
        const data = (await response.json()) as { uin?: number };
        if (typeof data.uin !== 'number') {
            throw new DianaError(ErrorCode.Login, '获取账号 uin 失败');
        }
        this.resolvedUin = data.uin;
        return data.uin;
    }

    /** 提交登录，成功后写入会话凭据。 */
    async login(): Promise<LoginResult> {
        const { appInfo, deviceInfo, keystore } = this.ctx;

        const tgtgtBody = packTlv(login0x144Pack, {
            '0x16e': { deviceName: deviceInfo.deviceName },
            '0x147': { appId: appInfo.AppId, ptVersion: appInfo.PtVersion, packageName: appInfo.PackageName },
            '0x128': {
                field0: 0,
                guidNew: 0,
                guidAvailable: 1,
                guidChanged: 0,
                guidFlag: 0,
                os: appInfo.Os,
                guid: deviceInfo.guid,
                brand: '',
            },
            '0x124': { empty: Buffer.alloc(12) },
        });

        const tlvPack = packTlv(loginPack, {
            '0x106': { a1: keystore.session.a1 ?? Buffer.alloc(0) },
            '0x144': { tgtgtEncrypted: encryptTea(tgtgtBody, keystore.stub.tgtgtKey) },
            '0x116': {
                version: 0,
                miscBitmap: 12058620,
                subSigMap: appInfo.SubSigMap,
                appIdCount: 0,
                appIdBytes: Buffer.alloc(0),
            },
            '0x142': { version: 0, packageName: appInfo.PackageName },
            '0x145': { guid: deviceInfo.guid },
            '0x018': {
                pingVersion: 0,
                ssoVersion: 5,
                field2: 0,
                appClientVersion: 8001,
                uin: keystore.uin,
                field5: 0,
                field6: 0,
            },
            '0x141': { field0: 'Unknown', networkType: 0, apn: '' },
            '0x177': { field0: 1, buildTime: 0, wtLoginSdk: appInfo.WtLoginSdk },
            '0x191': { k: 0 },
            '0x100': {
                dbBufVersion: 0,
                ssoVersion: 5,
                appId: appInfo.AppId,
                subAppId: appInfo.SubAppId,
                appClientVersion: appInfo.AppClientVersion,
                mainSigMap: appInfo.MainSigMap,
            },
            '0x107': { picType: 1, capType: 0, picSize: 0x0d, retType: 1 },
            '0x318': {},
            '0x16a': { noPicSig: keystore.session.noPicSig ?? Buffer.alloc(0) },
            '0x166': { imageType: 5 },
            '0x521': { productType: 0x13, productDesc: 'basicim' },
            '0x511': { domainCount: PSKEY_DOMAINS.length, domainEntries: encodePskeyDomains(PSKEY_DOMAINS) },
        });

        const request = new BytesWriter().writeUInt16BE(0x09).writeBuffer(tlvPack).toBuffer();
        const data = await this.call('wtlogin.login', this.wtlogin.buildPacket('wtlogin.login', request));
        const decoded = this.wtlogin.decodePacket(data);
        if (decoded.commandId !== 2064) {
            throw new DianaError(ErrorCode.Protocol, `意外的 command id: ${decoded.commandId}`);
        }

        const response = decodeTlv(loginResponseSchema, decoded.decrypted);
        const state = response['state'] as LoginState;
        const tlv = unpackTlv(loginResponsePack, response['tlvPack'] as Buffer);

        if (state !== LoginState.Success) {
            const failure = tlv['0x146'] as TlvData | undefined;
            return {
                success: false,
                state,
                tag: failure?.['tag'] as string | undefined,
                message: failure?.['message'] as string | undefined,
            };
        }

        const decrypted = unpackTlv(login0x119Pack, decryptTea((tlv['0x119'] as TlvData)['encryptedTlv'] as Buffer, keystore.stub.tgtgtKey));
        const uid = login0x543Body.decode((decrypted['0x543'] as TlvData)['protoBody'] as Buffer).layer1?.layer2?.uid ?? '';

        const a2 = (decrypted['0x10a'] as TlvData)['a2'] as Buffer;
        const d2 = (decrypted['0x143'] as TlvData)['d2'] as Buffer;
        const d2Key = (decrypted['0x305'] as TlvData)['d2Key'] as Buffer;

        keystore.session.a2 = a2;
        keystore.session.d2 = d2;
        keystore.session.d2Key = d2Key;
        keystore.session.uid = uid;

        // 同步到传输层，后续数据包将使用新的 d2/d2Key 加密
        const session = this.ctx.transport.session;
        session.uin = String(keystore.uin);
        session.uid = uid;
        session.a2 = a2;
        session.d2 = d2;
        session.d2Key = d2Key;

        return { success: true, uid };
    }

    private async call(command: 'wtlogin.login' | 'wtlogin.trans_emp', packet: Buffer): Promise<Buffer> {
        const response = await this.ctx.transport.send(command, packet);
        if (!('body' in response)) {
            throw new DianaError(ErrorCode.Login, `命令执行失败 (retcode=${response.retcode}): ${response.extra}`);
        }
        return response.body;
    }
}