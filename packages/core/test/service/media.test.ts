import { createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { LINUX_APP_INFO } from '../../src/common/app-info.js';
import { newDeviceInfo } from '../../src/common/device-info.js';
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
import { FetchHighwayUrlResponse } from '../../src/packet/httpconn.js';
import { ReqDataHighwayHead, RespDataHighwayHead } from '../../src/packet/highway.js';
import { NTV2RichMediaResponse } from '../../src/packet/media/index.js';
import { OidbBase } from '../../src/packet/oidb/index.js';
import { MsgInfo, PicFormat } from '../../src/packet/message/index.js';
import {
    computeMediaMetadata,
    HighwayService,
    MediaService,
    OidbService,
    SsoTransport,
} from '../../src/service/index.js';
import type { ImageMetadata } from '../../src/service/index.js';
import { decodeTlv, encodeTlv } from '../../src/tlv/index.js';
import type { TlvData } from '../../src/tlv/index.js';

const LOCAL_IP = 0x0100007f; // 127.0.0.1（QQ 小端整型表示）

/** 将响应体包进 OIDB 信封。 */
function wrapOidb(command: number, subCommand: number, body: Buffer): Buffer {
    return OidbBase.encode({ command, subCommand, body, properties: [], reserved: 0 });
}

function parseOutgoing(frame: Buffer): { command: string; sequence: number } {
    const wrapper = decodeTlv(outgoingSsoPacketWrapperSchema, frame);
    const inner = decodeTlv(outgoingSsoPacketSchema, decryptTea(wrapper['encrypted'] as Buffer, EMPTY_TEA_KEY));
    const header = inner['header'] as TlvData;
    return { command: header['command'] as string, sequence: header['sequence'] as number };
}

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

/** 上传响应中的兼容旧版消息体。 */
const COMPAT_QMSG = Buffer.from('0800180020', 'hex');

/** 服务端返回的 MsgInfo 原始字节。 */
const MSG_INFO = MsgInfo.encode({
    msgInfoBody: [{ index: { fileUuid: 'uuid-x', info: { width: 10, height: 20 } }, fileExist: true }],
    extBizInfo: { pic: { bizType: 0, textSummary: '[图片]' } },
});

function buildUploadResponse(): Buffer {
    return NTV2RichMediaResponse.encode({
        respHead: { common: { requestId: 1, command: 100 }, retCode: 0 },
        upload: {
            uKey: 'u-key-1',
            uKeyTtlSecond: 3600,
            ipv4s: [{ outIP: LOCAL_IP, outPort: 8080 }],
            msgInfo: MSG_INFO,
            compatQMsg: COMPAT_QMSG,
        },
    });
}

function buildDownloadResponse(): Buffer {
    return NTV2RichMediaResponse.encode({
        respHead: { common: { requestId: 1, command: 200 }, retCode: 0 },
        download: { rKeyParam: '&rkey=abc', rKeyTtlSecond: 3600, info: { domain: 'example.com', urlPath: '/download/path' } },
    });
}

/** 高速通道上传请求头（供断言）。 */
const highwayHeads: Array<ReturnType<typeof ReqDataHighwayHead.decode>> = [];

/** 高速通道上传的 mock 服务器：收到分片后回成功响应。 */
function startHighwayServer(): Promise<{ server: Server; port: number }> {
    const server = createServer((socket: Socket) => {
        socket.on('data', (chunk) => {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            const headLength = buffer.readUInt32BE(1);
            const reqHead = ReqDataHighwayHead.decode(buffer.subarray(9, 9 + headLength));
            highwayHeads.push(reqHead);
            const filesize = Number(reqHead.msgSegHead?.filesize ?? 0n);
            const response = RespDataHighwayHead.encode({
                msgSegHead: {
                    filesize: BigInt(filesize),
                    dataOffset: 0n,
                    dataLength: filesize,
                    serviceTicket: Buffer.alloc(0),
                    md5: Buffer.alloc(0),
                    fileMd5: Buffer.alloc(0),
                    queryTimes: 0,
                    updateCacheIp: 0,
                },
                errorCode: 0,
            });
            const frame = Buffer.allocUnsafe(9 + response.length + 1);
            frame[0] = 0x28;
            frame.writeUInt32BE(response.length, 1);
            frame.writeUInt32BE(0, 5);
            response.copy(frame, 9);
            frame[frame.length - 1] = 0x29;
            socket.write(frame);
        });
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            resolve({ server, port: typeof address === 'object' && address ? address.port : 0 });
        });
    });
}

const cleanups: Array<() => void> = [];
const imageData = Buffer.from('fake-image-bytes');
const imageMeta: ImageMetadata = {
    ...computeMediaMetadata(imageData),
    width: 640,
    height: 480,
    ext: 'png',
    format: PicFormat.PNG,
};

afterEach(() => {
    highwayHeads.length = 0;
    for (const cleanup of cleanups.splice(0)) {
        cleanup();
    }
});

async function setup(buildUpload: () => Buffer = buildUploadResponse): Promise<{ media: MediaService; highway: HighwayService }> {
    const appInfo = LINUX_APP_INFO;
    const deviceInfo = newDeviceInfo();
    const highway = await startHighwayServer();

    const server: Server = createServer((socket: Socket) => {
        const reader = new SsoFrameReader();
        socket.on('data', (chunk) => {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            for (const frame of reader.push(buffer)) {
                const { command, sequence } = parseOutgoing(frame);
                let response: Buffer | undefined;
                if (command === 'HttpConn.0x6ff_501') {
                    response = FetchHighwayUrlResponse.encode({
                        body: {
                            sigSession: Buffer.from('sig'),
                            sessionKey: Buffer.from('key'),
                            serverInfos: [
                                { serviceType: 1, serverAddrs: [{ type: 1, ip: LOCAL_IP, port: highway.port, area: 0 }] },
                            ],
                        },
                    });
                } else if (command === 'OidbSvcTrpcTcp.0x11c4_100') {
                    response = wrapOidb(0x11c4, 100, buildUpload());
                } else if (command === 'OidbSvcTrpcTcp.0x11c5_100') {
                    response = wrapOidb(0x11c5, 100, buildUpload());
                } else if (command === 'OidbSvcTrpcTcp.0x126e_100') {
                    response = wrapOidb(0x126e, 100, buildUpload());
                } else if (command === 'OidbSvcTrpcTcp.0x126d_100') {
                    response = wrapOidb(0x126d, 100, buildUpload());
                } else if (command === 'OidbSvcTrpcTcp.0x11c4_200') {
                    response = wrapOidb(0x11c4, 200, buildDownloadResponse());
                } else if (command === 'OidbSvcTrpcTcp.0x11c5_200') {
                    response = wrapOidb(0x11c5, 200, buildDownloadResponse());
                } else if (command === 'OidbSvcTrpcTcp.0x126e_200') {
                    response = wrapOidb(0x126e, 200, buildDownloadResponse());
                } else if (command === 'OidbSvcTrpcTcp.0x126d_200') {
                    response = wrapOidb(0x126d, 200, buildDownloadResponse());
                } else if (command === 'OidbSvcTrpcTcp.0x11ea_200') {
                    response = wrapOidb(0x11ea, 200, buildDownloadResponse());
                } else if (command === 'OidbSvcTrpcTcp.0x11e9_200') {
                    response = wrapOidb(0x11e9, 200, buildDownloadResponse());
                }
                if (response) {
                    socket.write(encodeSsoFrame(buildIncoming(command, sequence, response)));
                }
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
            uin: '10000',
            a2: Buffer.from('a2-token'),
            d2: Buffer.alloc(0),
            d2Key: Buffer.alloc(0),
            subAppId: appInfo.SubAppId,
            guid: deviceInfo.guid.toString('hex'),
            version: appInfo.CurrentVersion,
        },
    });
    await transport.connect();

    cleanups.push(() => {
        transport.close();
        server.close();
        highway.server.close();
    });

    const oidb = new OidbService(transport);
    const highwayService = new HighwayService(transport, 1600001604);
    return { media: new MediaService(oidb, highwayService, 'u_self'), highway: highwayService };
}

describe('媒体上传下载', () => {
    it('拉取高速上传服务器', async () => {
        const { highway } = await setup();
        const servers = await highway.fetchServer();
        expect(servers).toEqual([{ ip: '127.0.0.1', port: expect.any(Number) }]);
    });

    it('获取群图片下载 URL', async () => {
        const { media } = await setup();
        const url = await media.getGroupImageDownloadUrl({ fileUuid: 'uuid-x', storeId: 1 });
        expect(url).toBe('https://example.com/download/path&rkey=abc');
    });

    it('获取私聊图片下载 URL', async () => {
        const { media } = await setup();
        const url = await media.getPrivateImageDownloadUrl('u_target', { fileUuid: 'uuid-x', storeId: 1 });
        expect(url).toBe('https://example.com/download/path&rkey=abc');
    });

    it('上传群图片并原样透传服务端 MsgInfo 与兼容元素', async () => {
        const { media, highway } = await setup();
        await highway.fetchServer();
        const { msgInfo, compat } = await media.uploadGroupImage(888, imageData, imageMeta);
        // 字节完全一致，未经过解码-重编码
        expect(msgInfo.equals(MSG_INFO)).toBe(true);
        expect(MsgInfo.decode(msgInfo).msgInfoBody[0]?.index?.fileUuid).toBe('uuid-x');
        expect(compat?.equals(COMPAT_QMSG)).toBe(true);
    });

    it('高速上传请求头携带 a2 登录签名', async () => {
        const { media, highway } = await setup();
        await highway.fetchServer();
        await media.uploadGroupImage(888, imageData, imageMeta);
        const head = highwayHeads.at(-1);
        expect(head?.msgLoginSigHead?.uint32LoginSigType).toBe(8);
        expect(head?.msgLoginSigHead?.bytesLoginSig?.toString()).toBe('a2-token');
    });

    it('服务器快速返回（无 uKey）时跳过高速上传并复用已有文件', async () => {
        const { media, highway } = await setup(() =>
            NTV2RichMediaResponse.encode({
                respHead: { common: { requestId: 1, command: 100 }, retCode: 0 },
                upload: {
                    msgInfo: MsgInfo.encode({
                        msgInfoBody: [{ index: { fileUuid: 'uuid-cached', info: { width: 10, height: 20 } }, fileExist: true }],
                    }),
                },
            }),
        );
        await highway.fetchServer();
        const { msgInfo } = await media.uploadGroupImage(888, imageData, imageMeta);
        expect(MsgInfo.decode(msgInfo).msgInfoBody[0]?.index?.fileUuid).toBe('uuid-cached');
    });

    it('上传私聊图片并返回可用的 MsgInfo', async () => {
        const { media, highway } = await setup();
        await highway.fetchServer();
        const { msgInfo } = await media.uploadPrivateImage('u_target', imageData, imageMeta);
        expect(MsgInfo.decode(msgInfo).msgInfoBody[0]?.index?.fileUuid).toBe('uuid-x');
    });

    it('上传群语音并返回可用的 MsgInfo', async () => {
        const { media, highway } = await setup();
        await highway.fetchServer();
        const voiceMeta = computeMediaMetadata(Buffer.from('fake-voice-bytes'));
        const { msgInfo } = await media.uploadGroupRecord(888, Buffer.from('fake-voice-bytes'), voiceMeta, 3);
        expect(MsgInfo.decode(msgInfo).msgInfoBody[0]?.index?.fileUuid).toBe('uuid-x');
    });

    it('获取私聊语音下载 URL', async () => {
        const { media } = await setup();
        const url = await media.getPrivateRecordDownloadUrl('u_target', { fileUuid: 'uuid-x', storeId: 1 });
        expect(url).toBe('https://example.com/download/path&rkey=abc');
    });

    it('获取群视频下载 URL', async () => {
        const { media } = await setup();
        const url = await media.getGroupVideoDownloadUrl({ fileUuid: 'uuid-x', storeId: 1 });
        expect(url).toBe('https://example.com/download/path&rkey=abc');
    });
});
