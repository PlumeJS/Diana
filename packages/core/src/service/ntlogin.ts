import type { AppInfo } from '../common/app-info.js';
import type { DeviceInfo } from '../common/device-info.js';
import { DianaError, ErrorCode } from '../common/errors.js';
import { aesGcmDecrypt, aesGcmEncrypt } from '../crypto/aes.js';
import { sha256 } from '../crypto/digest.js';
import { Ecdh } from '../crypto/ecdh.js';
import {
    KeyExchangeRequest,
    KeyExchangeRequestBuf,
    KeyExchangeResponse,
    KeyExchangeResponseSecret,
    NTLoginCommon,
    NTLoginEasyLoginReqBody,
    NTLoginEasyLoginRspBody,
    NTLoginForwardRequest,
    NTLoginPlatform,
    NTLoginRetCode,
} from '../packet/login/index.js';
import type { NTLoginHead, NTLoginTickets } from '../packet/login/index.js';
import { EncryptionType } from '../packet/sso.js';
import type { InferProtoModel, InferProtoModelInput } from '../pb/index.js';
import { BytesWriter } from '../util/bytes.js';
import type { Keystore } from './keystore.js';
import type { SsoTransport } from './transport.js';

/** 密钥交换命令字。 */
const KEY_EXCHANGE_COMMAND = 'trpc.login.ecdh.EcdhService.SsoKeyExchange';

/** 快速登录命令字。 */
const EASY_LOGIN_COMMAND = 'trpc.login.ecdh.EcdhService.SsoNTLoginEasyLogin';

/** 校验哈希所用的固定密钥。 */
const VERIFY_HASH_KEY = Buffer.from('e2733bf403149913cbf80c7a95168bd4ca6935ee53cd39764beebe2e007e3aee', 'hex');

/** NT 登录所需的上下文。 */
export interface NtLoginContext {
    appInfo: AppInfo;
    deviceInfo: DeviceInfo;
    keystore: Keystore;
    transport: SsoTransport;
}

/** 快速登录结果。 */
export type EasyLoginResult =
    | { success: true; tickets: InferProtoModel<typeof NTLoginTickets.fields> }
    | { success: false; code: number; title?: string; message?: string };

/** 依据平台标识推断 NT 登录平台枚举。 */
function platformOf(vendorOs: string): NTLoginPlatform {
    const os = vendorOs.toLowerCase();
    if (os.includes('win')) {
        return NTLoginPlatform.Windows;
    }
    if (os.includes('mac') || os.includes('darwin')) {
        return NTLoginPlatform.MacOs;
    }
    if (os.includes('linux')) {
        return NTLoginPlatform.Linux;
    }
    return NTLoginPlatform.Unknown;
}

/** NT 登录（ECDH 密钥交换 + 快速登录）。 */
export class NtLoginService {
    constructor(private readonly ctx: NtLoginContext) {}

    /** 执行 ECDH 密钥交换，成功后把会话密钥写入 keystore。 */
    async keyExchange(): Promise<void> {
        const { deviceInfo, keystore, transport } = this.ctx;
        const ecdh = new Ecdh('prime256v1', false);
        const timestamp = Math.floor(Date.now() / 1000);

        const secret = KeyExchangeRequestBuf.encode({ uin: String(keystore.uin), guid: deviceInfo.guid });
        const secretBuf = aesGcmEncrypt(secret, ecdh.shareKey);

        const verifyPacket = new BytesWriter()
            .writeBuffer(ecdh.publicKey)
            .writeUInt32BE(1)
            .writeBuffer(secretBuf)
            .writeUInt32BE(0)
            .writeUInt32BE(timestamp)
            .toBuffer();

        const request = KeyExchangeRequest.encode({
            publicKey: ecdh.publicKey,
            type: 1,
            secret: secretBuf,
            timestamp: BigInt(timestamp),
            verifyHash: aesGcmEncrypt(sha256(verifyPacket), VERIFY_HASH_KEY),
        });

        const reply = await transport.send(KEY_EXCHANGE_COMMAND, request, EncryptionType.TeaByEmptyKey);
        if (!('body' in reply)) {
            throw new DianaError(ErrorCode.Login, `密钥交换失败 (retcode=${reply.retcode}): ${reply.extra}`);
        }
        const response = KeyExchangeResponse.decode(reply.body);
        const decrypted = KeyExchangeResponseSecret.decode(aesGcmDecrypt(response.secret, ecdh.exchange(response.publicKey)));
        keystore.keyExchange = { sessionKey: decrypted.sessionKey, sessionTicket: decrypted.sessionTicket };
    }

    /** 使用 a1 进行快速登录，返回账号票据。 */
    async easyLogin(a1: Buffer): Promise<EasyLoginResult> {
        const { keystore, transport } = this.ctx;
        const session = keystore.keyExchange;
        if (!session) {
            throw new DianaError(ErrorCode.Login, '尚未完成密钥交换，无法快速登录');
        }

        const login = NTLoginCommon.encode({
            head: this.buildHead(),
            body: NTLoginEasyLoginReqBody.encode({ a1 }),
        });
        const request = NTLoginForwardRequest.encode({
            sessionTicket: session.sessionTicket,
            buffer: aesGcmEncrypt(login, session.sessionKey),
            type: 1,
        });

        const reply = await transport.send(EASY_LOGIN_COMMAND, request, EncryptionType.TeaByEmptyKey);
        if (!('body' in reply)) {
            throw new DianaError(ErrorCode.Login, `快速登录请求失败 (retcode=${reply.retcode}): ${reply.extra}`);
        }
        const forward = NTLoginForwardRequest.decode(reply.body);
        if (!forward.buffer) {
            throw new DianaError(ErrorCode.Login, '快速登录响应缺少数据');
        }
        const decrypted = NTLoginCommon.decode(aesGcmDecrypt(forward.buffer, session.sessionKey));
        const errorInfo = decrypted.head?.errorInfo;
        const code = Number(errorInfo?.errCode ?? 0n);
        if (code !== NTLoginRetCode.Success) {
            return { success: false, code, title: errorInfo?.strTipsTitle, message: errorInfo?.strTipsContent };
        }
        const body = NTLoginEasyLoginRspBody.decode(decrypted.body ?? Buffer.alloc(0));
        if (!body.tickets) {
            return { success: false, code: NTLoginRetCode.UnusualDevice, message: '快速登录未返回票据' };
        }
        return { success: true, tickets: body.tickets };
    }

    /** 使用已保存的 a1 执行密钥交换与快速登录，刷新会话凭据。 */
    async refreshSession(): Promise<void> {
        const { keystore, transport } = this.ctx;
        const a1 = keystore.session.a1;
        if (!a1 || a1.length === 0) {
            throw new DianaError(ErrorCode.Login, '缺少 a1，无法刷新会话');
        }

        await this.keyExchange();
        const result = await this.easyLogin(a1);
        if (!result.success) {
            throw new DianaError(
                ErrorCode.Login,
                `快速登录失败 (code=${result.code}): ${result.title ?? ''} ${result.message ?? ''}`.trim(),
            );
        }

        const { tickets } = result;
        keystore.session.a2 = tickets.a2 ?? keystore.session.a2;
        keystore.session.d2 = tickets.d2 ?? keystore.session.d2;
        keystore.session.d2Key = tickets.d2Key ?? keystore.session.d2Key;
        keystore.session.a1 = tickets.a1 ?? a1;
        if (tickets.noPicSig) {
            keystore.session.noPicSig = tickets.noPicSig;
        }

        const session = transport.session;
        session.uin = String(keystore.uin);
        session.a2 = keystore.session.a2;
        session.d2 = keystore.session.d2;
        session.d2Key = keystore.session.d2Key;
    }

    /** 构造 NT 登录公共头。 */
    private buildHead(): InferProtoModelInput<typeof NTLoginHead.fields> {
        const { appInfo, deviceInfo, keystore } = this.ctx;
        return {
            userInfo: { account: String(keystore.uin) },
            clientInfo: {
                deviceType: appInfo.Os,
                deviceName: deviceInfo.deviceName,
                platform: platformOf(appInfo.VendorOs),
                guid: deviceInfo.guid,
            },
            appInfo: {
                version: appInfo.Kernel,
                appId: appInfo.AppId,
                appName: appInfo.PackageName,
                qua: appInfo.Qua,
            },
            sdkInfo: { version: 1 },
        };
    }
}
