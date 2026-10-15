import { ProtoField, ProtoMessage, ScalarType } from '../../pb/index.js';

/** NT 登录平台。 */
export enum NTLoginPlatform {
    Unknown = 0,
    Ios = 1,
    Android = 2,
    Symbian = 3,
    Windows = 4,
    MacOs = 5,
    IPad = 6,
    Linux = 7,
    Harmony = 8,
}

/** NT 登录返回码（仅列出本实现关心的取值）。 */
export enum NTLoginRetCode {
    Success = 0,
    UnusualDevice = 140022011,
}

/** ECDH 密钥交换请求。 */
export const KeyExchangeRequest = ProtoMessage.of({
    publicKey: ProtoField(1, ScalarType.BYTES),
    type: ProtoField(2, ScalarType.UINT32),
    secret: ProtoField(3, ScalarType.BYTES),
    timestamp: ProtoField(4, ScalarType.INT64),
    verifyHash: ProtoField(5, ScalarType.BYTES),
});

/** ECDH 密钥交换响应。 */
export const KeyExchangeResponse = ProtoMessage.of({
    secret: ProtoField(1, ScalarType.BYTES),
    field2: ProtoField(2, ScalarType.BYTES, { optional: true }),
    publicKey: ProtoField(3, ScalarType.BYTES),
});

/** 密钥交换请求明文（AES-GCM 加密后作为 `secret`）。 */
export const KeyExchangeRequestBuf = ProtoMessage.of({
    uin: ProtoField(1, ScalarType.STRING, { optional: true }),
    guid: ProtoField(2, ScalarType.BYTES, { optional: true }),
});

/** 密钥交换响应明文。 */
export const KeyExchangeResponseSecret = ProtoMessage.of({
    sessionKey: ProtoField(1, ScalarType.BYTES),
    sessionTicket: ProtoField(2, ScalarType.BYTES),
    expiration: ProtoField(3, ScalarType.UINT32, { optional: true }),
});

/** NT 登录转发信封。 */
export const NTLoginForwardRequest = ProtoMessage.of({
    sessionTicket: ProtoField(1, ScalarType.BYTES),
    buffer: ProtoField(3, ScalarType.BYTES, { optional: true }),
    type: ProtoField(4, ScalarType.UINT32, { optional: true }),
    secBuffer: ProtoField(5, ScalarType.BYTES, { optional: true }),
});

/** 公共头：用户信息。 */
export const NTLoginUserInfo = ProtoMessage.of({
    account: ProtoField(1, ScalarType.STRING, { optional: true }),
    countryCode: ProtoField(2, ScalarType.UINT32, { optional: true }),
});

/** 公共头：客户端信息。 */
export const NTLoginClientInfo = ProtoMessage.of({
    deviceType: ProtoField(1, ScalarType.STRING, { optional: true }),
    deviceName: ProtoField(2, ScalarType.STRING, { optional: true }),
    platform: ProtoField(3, ScalarType.UINT32, { optional: true }),
    guid: ProtoField(4, ScalarType.BYTES, { optional: true }),
    pubno: ProtoField(5, ScalarType.UINT32, { optional: true }),
    clientVer: ProtoField(6, ScalarType.UINT32, { optional: true }),
    clientType: ProtoField(7, ScalarType.UINT32, { optional: true }),
    ssoVer: ProtoField(8, ScalarType.UINT32, { optional: true }),
});

/** 公共头：应用信息。 */
export const NTLoginAppInfo = ProtoMessage.of({
    version: ProtoField(1, ScalarType.STRING, { optional: true }),
    appId: ProtoField(2, ScalarType.INT32, { optional: true }),
    appName: ProtoField(3, ScalarType.STRING, { optional: true }),
    clientA1Version: ProtoField(4, ScalarType.UINT32, { optional: true }),
    qua: ProtoField(5, ScalarType.STRING, { optional: true }),
});

/** 公共头：SDK 信息。 */
export const NTLoginSdkInfo = ProtoMessage.of({
    version: ProtoField(1, ScalarType.UINT32, { optional: true }),
});

/** 公共头：Cookie。 */
export const NTLoginCookie = ProtoMessage.of({
    cookieContent: ProtoField(1, ScalarType.STRING, { optional: true }),
});

/** 公共头：错误信息。 */
export const NTLoginErrorInfo = ProtoMessage.of({
    errCode: ProtoField(1, ScalarType.UINT64, { optional: true }),
    strTipsTitle: ProtoField(2, ScalarType.STRING, { optional: true }),
    strTipsContent: ProtoField(3, ScalarType.STRING, { optional: true }),
    strJumpWording: ProtoField(4, ScalarType.STRING, { optional: true }),
    strJumpUrl: ProtoField(5, ScalarType.STRING, { optional: true }),
});

/** NT 登录公共头。 */
export const NTLoginHead = ProtoMessage.of({
    userInfo: ProtoField(1, () => NTLoginUserInfo.fields, { optional: true }),
    clientInfo: ProtoField(2, () => NTLoginClientInfo.fields, { optional: true }),
    appInfo: ProtoField(3, () => NTLoginAppInfo.fields, { optional: true }),
    errorInfo: ProtoField(4, () => NTLoginErrorInfo.fields, { optional: true }),
    cookie: ProtoField(5, () => NTLoginCookie.fields, { optional: true }),
    sdkInfo: ProtoField(7, () => NTLoginSdkInfo.fields, { optional: true }),
});

/** NT 登录公共包（头 + 业务体）。 */
export const NTLoginCommon = ProtoMessage.of({
    head: ProtoField(1, () => NTLoginHead.fields, { optional: true }),
    body: ProtoField(2, ScalarType.BYTES, { optional: true }),
});

/** 快速登录请求体。 */
export const NTLoginEasyLoginReqBody = ProtoMessage.of({
    a1: ProtoField(1, ScalarType.BYTES),
});

/** 账号票据。 */
export const NTLoginTickets = ProtoMessage.of({
    a1: ProtoField(3, ScalarType.BYTES, { optional: true }),
    a2: ProtoField(4, ScalarType.BYTES, { optional: true }),
    d2: ProtoField(5, ScalarType.BYTES, { optional: true }),
    d2Key: ProtoField(6, ScalarType.BYTES, { optional: true }),
    noPicSig: ProtoField(13, ScalarType.BYTES, { optional: true }),
});

/** 安全校验。 */
export const NTLoginSecCheck = ProtoMessage.of({
    iframeUrl: ProtoField(3, ScalarType.STRING, { optional: true }),
});

/** 安全保护。 */
export const NTLoginSecProtect = ProtoMessage.of({
    newDeviceCheckSig: ProtoField(1, ScalarType.BYTES, { optional: true }),
    unusualDeviceCheckSig: ProtoField(2, ScalarType.BYTES, { optional: true }),
    unusualDeviceQrSig: ProtoField(3, ScalarType.STRING, { optional: true }),
    uinToken: ProtoField(4, ScalarType.STRING, { optional: true }),
});

/** 快速登录响应体。 */
export const NTLoginEasyLoginRspBody = ProtoMessage.of({
    tickets: ProtoField(1, () => NTLoginTickets.fields, { optional: true }),
    secCheck: ProtoField(2, () => NTLoginSecCheck.fields, { optional: true }),
    secProtect: ProtoField(3, () => NTLoginSecProtect.fields, { optional: true }),
});
