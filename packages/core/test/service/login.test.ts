import { createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { LINUX_APP_INFO } from '../../src/common/app-info.js';
import { newDeviceInfo } from '../../src/common/device-info.js';
import { Ecdh } from '../../src/crypto/ecdh.js';
import { decryptTea, encryptTea } from '../../src/crypto/tea.js';
import {
    CompressionType,
    EMPTY_TEA_KEY,
    EncryptionType,
    encodeSsoFrame,
    incomingSsoPacketSchema,
    incomingSsoPacketWrapperSchema,
    outgoingSsoPacketSchema,
    outgoingSsoPacketWrapperSchema,
    SSO_PROTOCOL,
    SsoFrameReader,
} from '../../src/packet/index.js';
import {
    LoginState,
    login0x119Pack,
    login0x543Body,
    loginResponsePack,
    loginResponseSchema,
    QrCodeState,
    qrConfirmPack,
    qrFetchResponsePack,
    qrcode0xd1Response,
    transEmp12ConfirmedSchema,
    transEmp12ResponseSchema,
    transEmp31ResponseSchema,
} from '../../src/packet/login/index.js';
import { Keystore, LoginService, SsoTransport } from '../../src/service/index.js';
import type { LoginContext } from '../../src/service/index.js';
import { decodeTlv, encodeTlv, packTlv } from '../../src/tlv/index.js';
import type { TlvData } from '../../src/tlv/index.js';
import { BytesReader, BytesWriter } from '../../src/util/bytes.js';

const A1 = randomBytes(16);
const SIGN = randomBytes(8);
const TGTGT = randomBytes(16);
const A2 = randomBytes(16);
const D2 = randomBytes(16);
const D2KEY = randomBytes(16);

const TRANS_EMP_COMMAND_ID = 2066;
const LOGIN_COMMAND_ID = 2064;

/** 解析客户端发送的出站 SSO 包（外层信封）。 */
function parseOutgoing(frame: Buffer): { command: string; sequence: number; body: Buffer } {
    const wrapper = decodeTlv(outgoingSsoPacketWrapperSchema, frame);
    const inner = decodeTlv(outgoingSsoPacketSchema, decryptTea(wrapper['encrypted'] as Buffer, EMPTY_TEA_KEY));
    const header = inner['header'] as TlvData;
    return {
        command: header['command'] as string,
        sequence: header['sequence'] as number,
        body: inner['body'] as Buffer,
    };
}

/** 解密 wtlogin 请求体（跳过包头与加密头）。 */
function decodeWtLoginRequest(packet: Buffer, shareKey: Buffer): Buffer {
    const reader = new BytesReader(packet);
    reader.readBuffer(48); // 0x02 + 长度 + 固定头 + 加密头常量
    const keyLength = reader.readUInt16BE();
    reader.readBuffer(keyLength);
    const encrypted = reader.readBuffer(reader.remaining);
    return decryptTea(encrypted.subarray(0, -1), shareKey);
}

/** 构造服务端返回的入站 SSO 包（空密钥加密外层）。 */
function buildIncoming(command: string, sequence: number, body: Buffer): Buffer {
    const inner = encodeTlv(incomingSsoPacketSchema, {
        header: {
            sequence,
            retcode: 0,
            extra: '',
            command,
            msgCookie: Buffer.alloc(0),
            compressionType: CompressionType.None,
            reserveField: Buffer.alloc(0),
        },
        raw: body,
    });
    return encodeTlv(incomingSsoPacketWrapperSchema, {
        protocol: SSO_PROTOCOL,
        encryptionType: EncryptionType.TeaByEmptyKey,
        flag2: 0,
        uin: '0',
        packet: encryptTea(inner, EMPTY_TEA_KEY),
    });
}

/** 构造服务端 wtlogin 响应包（结构与客户端 buildPacket 不同）。 */
function buildWtResponse(ecdh192: Ecdh, commandId: number, inner: Buffer): Buffer {
    const header = new BytesWriter()
        .writeUInt16BE(8001) // version
        .writeUInt16BE(commandId)
        .writeUInt16BE(0) // sequence
        .writeUInt32BE(0) // uin
        .writeUInt8(0) // flag
        .writeUInt16BE(0) // retryTime
        .toBuffer();
    const body = Buffer.concat([header, encryptTea(inner, ecdh192.shareKey), Buffer.from([0x03])]);
    return Buffer.concat([Buffer.from([0x02]), Buffer.from([(body.length >> 8) & 0xff, body.length & 0xff]), body]);
}

/** 构造 trans_emp 响应信封：`8 字节 + subCommand + 40 字节 + appId + 载荷`。 */
function buildTransEmpResponse(subCommand: number, payload: Buffer): Buffer {
    return new BytesWriter()
        .writeBuffer(Buffer.alloc(8))
        .writeUInt16BE(subCommand)
        .writeBuffer(Buffer.alloc(40))
        .writeUInt32BE(0)
        .writeBuffer(payload)
        .toBuffer();
}

function buildFetchResponse(): Buffer {
    const tlvPack = packTlv(qrFetchResponsePack, {
        '0x17': { qrCode: Buffer.from('QR-DATA') },
        '0x1c': { expirationInSec: 120, expirationInMin: 2 },
        '0xd1': { body: qrcode0xd1Response.encode({ url: 'https://qr.example/login', qrSig: 'qr-sig-value' }) },
    });
    return encodeTlv(transEmp31ResponseSchema, { dummyByte: 0, signature: Buffer.alloc(16, 1), tlvPack });
}

function buildQueryResponse(state: QrCodeState): Buffer {
    if (state !== QrCodeState.Confirmed) {
        return encodeTlv(transEmp12ResponseSchema, { qrCodeState: state, remaining: Buffer.alloc(0) });
    }
    const confirmTlv = packTlv(qrConfirmPack, {
        '0x18': { a1: A1 },
        '0x19': { noPicSig: SIGN },
        '0x1e': { tgtgtKey: TGTGT },
    });
    const confirmed = encodeTlv(transEmp12ConfirmedSchema, { misc: Buffer.alloc(12), tlvPack: confirmTlv });
    return encodeTlv(transEmp12ResponseSchema, { qrCodeState: state, remaining: confirmed });
}

function buildLoginResponse(state: LoginState): Buffer {
    if (state !== LoginState.Success) {
        const tlv = packTlv(loginResponsePack, {
            '0x146': { state: 1, tag: 'need-slider', message: 'verify', field0: 0 },
        });
        return encodeTlv(loginResponseSchema, { command: 0x09, state, tlvPack: tlv });
    }
    const inner = packTlv(login0x119Pack, {
        '0x11a': { faceId: 0, age: 0, gender: 0, nickname: 'tester' },
        '0x305': { d2Key: D2KEY },
        '0x543': { protoBody: login0x543Body.encode({ layer1: { layer2: { uid: 'u_test' } } }) },
        '0x10a': { a2: A2 },
        '0x143': { d2: D2 },
        '0x106': { a1: A1 },
    });
    const tlv = packTlv(loginResponsePack, {
        '0x119': { encryptedTlv: encryptTea(inner, TGTGT) },
        '0x146': { state: 0, tag: '', message: '', field0: 0 },
    });
    return encodeTlv(loginResponseSchema, { command: 0x09, state, tlvPack: tlv });
}

interface MockOptions {
    qrState?: QrCodeState;
    loginState?: LoginState;
}

const cleanups: Array<() => void> = [];

afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
        cleanup();
    }
});

interface SetupResult {
    service: LoginService;
    keystore: Keystore;
    ecdh192: Ecdh;
    requests: Array<{ command: string; body: Buffer }>;
}

async function setupLogin(options: MockOptions = {}): Promise<SetupResult> {
    const appInfo = LINUX_APP_INFO;
    const deviceInfo = newDeviceInfo();
    const keystore = new Keystore();
    const ecdh192 = new Ecdh('secp192k1', true);

    // 模拟服务器：第 1 个 trans_emp 请求返回二维码，后续返回轮询结果
    let transEmpCount = 0;
    const requests: Array<{ command: string; body: Buffer }> = [];
    const server: Server = createServer((socket: Socket) => {
        const reader = new SsoFrameReader();
        socket.on('data', (chunk) => {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            for (const frame of reader.push(buffer)) {
                const { command, sequence, body } = parseOutgoing(frame);
                requests.push({ command, body });
                let commandId: number;
                let response: Buffer;
                if (command === 'wtlogin.trans_emp') {
                    commandId = TRANS_EMP_COMMAND_ID;
                    transEmpCount += 1;
                    const first = transEmpCount === 1;
                    const subCommand = first ? 0x31 : 0x12;
                    const payload = first ? buildFetchResponse() : buildQueryResponse(options.qrState ?? QrCodeState.Confirmed);
                    response = buildTransEmpResponse(subCommand, payload);
                } else {
                    commandId = LOGIN_COMMAND_ID;
                    response = buildLoginResponse(options.loginState ?? LoginState.Success);
                }
                socket.write(encodeSsoFrame(buildIncoming(command, sequence, buildWtResponse(ecdh192, commandId, response))));
            }
        });
    });

    const port = await new Promise<number>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            resolve(typeof address === 'object' && address ? address.port : 0);
        });
    });

    const transport = new SsoTransport({
        host: '127.0.0.1',
        port,
        session: {
            uin: String(keystore.uin),
            a2: keystore.session.a2,
            d2: keystore.session.d2,
            d2Key: keystore.session.d2Key,
            subAppId: appInfo.SubAppId,
            guid: deviceInfo.guid.toString('hex'),
            version: appInfo.CurrentVersion,
        },
    });
    await transport.connect();

    const ctx: LoginContext = { appInfo, deviceInfo, transport, keystore, ecdh192 };
    cleanups.push(() => {
        transport.close();
        server.close();
    });
    return { service: new LoginService(ctx), keystore, ecdh192, requests };
}

describe('LoginService', () => {
    it('fetches a qr code', async () => {
        const { service } = await setupLogin();
        const info = await service.fetchQrCode();
        expect(info.url).toBe('https://qr.example/login');
        expect(info.qrSig).toBe('qr-sig-value');
        expect(info.qrCode.toString()).toBe('QR-DATA');
        expect(info.expiration).toBe(120);
    });

    it('拉取二维码的 trans_emp 请求带 TransEmp31 外框', async () => {
        const { service, ecdh192, requests } = await setupLogin();
        await service.fetchQrCode();

        const decrypted = decodeWtLoginRequest(requests[0].body, ecdh192.shareKey);
        const reader = new BytesReader(decrypted);
        reader.readBuffer(21); // 外层头 + requestBody 前段
        const subCommand = reader.readUInt16BE();
        reader.readBuffer(40); // 版本/序号等固定字段

        // 去掉结尾的 0x03 终止字节
        const frame = new BytesReader(reader.readBuffer(reader.remaining - 1));
        expect(subCommand).toBe(0x31);
        expect(frame.readUInt32BE()).toBe(LINUX_APP_INFO.AppId);
        expect(frame.readBigUInt64BE()).toBe(0n);
        frame.readBuffer(1); // field4
        frame.readBuffer(2); // field5
        expect(frame.readBuffer(frame.remaining).length).toBeGreaterThan(0);
    });

    it('stores login material once the qr code is confirmed', async () => {
        const { service, keystore } = await setupLogin();
        await service.fetchQrCode();
        const result = await service.queryQrCode();
        expect(result).toEqual({ confirmed: true });
        expect(keystore.session.a1?.equals(A1)).toBe(true);
        expect(keystore.session.noPicSig?.equals(SIGN)).toBe(true);
        expect(keystore.stub.tgtgtKey.equals(TGTGT)).toBe(true);
    });

    it('reports a pending qr code state', async () => {
        const { service } = await setupLogin({ qrState: QrCodeState.WaitingForConfirm });
        await service.fetchQrCode();
        const result = await service.queryQrCode();
        expect(result).toEqual({ confirmed: false, state: QrCodeState.WaitingForConfirm });
    });

    it('submits login and stores the session', async () => {
        const { service, keystore } = await setupLogin();
        await service.fetchQrCode();
        await service.queryQrCode();
        const result = await service.login();
        expect(result).toEqual({ success: true, uid: 'u_test' });
        expect(keystore.session.a2.equals(A2)).toBe(true);
        expect(keystore.session.d2.equals(D2)).toBe(true);
        expect(keystore.session.d2Key.equals(D2KEY)).toBe(true);
    });

    it('returns the failure state when login is rejected', async () => {
        const { service } = await setupLogin({ loginState: LoginState.Slider });
        await service.fetchQrCode();
        await service.queryQrCode();
        const result = await service.login();
        expect(result).toEqual({ success: false, state: LoginState.Slider, tag: 'need-slider', message: 'verify' });
    });
});
