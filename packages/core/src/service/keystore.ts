/** 登录会话凭据。 */
export interface LoginSession {
    /** 会话 a2 令牌。 */
    a2: Buffer;
    /** 会话 d2。 */
    d2: Buffer;
    /** 会话 d2Key。 */
    d2Key: Buffer;
    /** 二维码确认后获得的 a1。 */
    a1?: Buffer;
    /** 二维码签名。 */
    qrSign?: Buffer;
    /** 二维码签名串（用于查询 uin）。 */
    qrString?: string;
    /** 二维码登录 URL。 */
    qrUrl?: string;
    /** 免验证码签名。 */
    noPicSig?: Buffer;
    /** 登录成功后的账号 uid。 */
    uid?: string;
}

/** 登录过程中使用的凭据状态。 */
export class Keystore {
    /** 当前账号 uin。 */
    uin = 0;

    /** 登录所需的中间密钥。 */
    stub: { tgtgtKey: Buffer } = { tgtgtKey: Buffer.alloc(16) };

    /** 会话凭据。 */
    session: LoginSession = {
        a2: Buffer.alloc(0),
        d2: Buffer.alloc(0),
        d2Key: Buffer.alloc(16),
    };

    /** ECDH 密钥交换得到的会话（用于 NT 登录信封加密）。 */
    keyExchange?: { sessionKey: Buffer; sessionTicket: Buffer };
}