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
import { groupFileResponse, OidbBase } from '../../src/packet/oidb/index.js';
import { GroupFileService, HighwayService, OidbService, SsoTransport } from '../../src/service/index.js';
import { decodeTlv, encodeTlv } from '../../src/tlv/index.js';
import type { TlvData } from '../../src/tlv/index.js';

const LOCAL_IP = 0x0100007f;

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

function wrapOidb(command: number, subCommand: number, body: Buffer): Buffer {
    return OidbBase.encode({ command, subCommand, body, properties: [], reserved: 0 });
}

function startHighwayServer(): Promise<{ server: Server; port: number }> {
    const server = createServer((socket: Socket) => {
        socket.on('data', (chunk) => {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            const headLength = buffer.readUInt32BE(1);
            const reqHead = ReqDataHighwayHead.decode(buffer.subarray(9, 9 + headLength));
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

afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
        cleanup();
    }
});

async function setup(): Promise<{ service: GroupFileService; highway: HighwayService }> {
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
                } else if (command === 'OidbSvcTrpcTcp.0x6d6_0') {
                    response = wrapOidb(
                        0x6d6,
                        0,
                        groupFileResponse.encode({
                            upload: {
                                retCode: 0,
                                fileId: 'fid-1',
                                fileKey: Buffer.from('fk'),
                                checkKey: Buffer.from('ck'),
                                uploadIp: '127.0.0.1',
                                uploadPort: highway.port,
                            },
                        }),
                    );
                } else if (command === 'OidbSvcTrpcTcp.0x6d6_2') {
                    response = wrapOidb(
                        0x6d6,
                        2,
                        groupFileResponse.encode({
                            download: { downloadDns: 'example.com', downloadUrl: Buffer.from([0xaa, 0xbb]) },
                        }),
                    );
                } else if (command === 'OidbSvcTrpcTcp.0x6d6_3') {
                    response = wrapOidb(0x6d6, 3, groupFileResponse.encode({ delete: { retCode: 0 } }));
                } else if (command === 'OidbSvcTrpcTcp.0x6d9_4') {
                    response = wrapOidb(0x6d9, 4, Buffer.alloc(0));
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
        // 测试用签名桩：满足强制签名校验
        signProvider: {
            async sign() {
                return { sign: Buffer.from('aa', 'hex'), token: Buffer.from('bb', 'hex'), extra: Buffer.from('cc', 'hex') };
            },
        },
        session: {
            uin: '10000',
            a2: Buffer.alloc(0),
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

    const highwayService = new HighwayService(transport, 1600001604);
    return { service: new GroupFileService(new OidbService(transport), highwayService), highway: highwayService };
}

describe('群文件', () => {
    it('上传群文件并返回文件信息', async () => {
        const { service, highway } = await setup();
        await highway.fetchServer();
        const fileData = Buffer.from('group-file-content');
        const result = await service.upload(888, '/', 'test.txt', fileData, {
            size: fileData.length,
            md5: Buffer.from('md5'),
            sha1: Buffer.from('sha1'),
        });
        expect(result.fileId).toBe('fid-1');
        expect(result.uploadIp).toBe('127.0.0.1');
    });

    it('获取群文件下载 URL', async () => {
        const { service } = await setup();
        const url = await service.getDownloadUrl(888, 'fid-1');
        expect(url).toBe('https://example.com/ftn_handler/aabb/?fname=');
    });

    it('删除群文件', async () => {
        const { service } = await setup();
        await expect(service.delete(888, 'fid-1')).resolves.toBeUndefined();
    });
});
