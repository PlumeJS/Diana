import { createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { LINUX_APP_INFO } from '../../src/common/app-info.js';
import { newDeviceInfo } from '../../src/common/device-info.js';
import { decryptTea, encryptTea } from '../../src/crypto/tea.js';
import { FetchHighwayUrlResponse } from '../../src/packet/httpconn.js';
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
import { fetchFaceDetailsResponseContract } from '../../src/packet/oidb/index.js';
import { KickNTReq, SsoHeartBeatResponse, SsoInfoSyncResponse } from '../../src/packet/system.js';
import { HighwayService, OidbService, SsoTransport, SystemService } from '../../src/service/index.js';
import type { KickInfo } from '../../src/service/index.js';
import { decodeTlv, encodeTlv } from '../../src/tlv/index.js';
import type { TlvData } from '../../src/tlv/index.js';

const REGISTER_COMMAND = 'trpc.msg.register_proxy.RegisterProxy.SsoInfoSync';
const FACE_COMMAND = 'OidbSvcTrpcTcp.0x9154_1';
const HIGHWAY_COMMAND = 'HttpConn.0x6ff_501';
const HEARTBEAT_COMMAND = 'trpc.qq_new_tech.status_svc.StatusService.SsoHeartBeat';
const UNREGISTER_COMMAND = 'trpc.qq_new_tech.status_svc.StatusService.UnRegister';

/** 解析客户端发送的出站 SSO 包。 */
function parseOutgoing(frame: Buffer): { command: string; sequence: number } {
    const wrapper = decodeTlv(outgoingSsoPacketWrapperSchema, frame);
    const inner = decodeTlv(outgoingSsoPacketSchema, decryptTea(wrapper['encrypted'] as Buffer, EMPTY_TEA_KEY));
    const header = inner['header'] as TlvData;
    return { command: header['command'] as string, sequence: header['sequence'] as number };
}

/** 构造服务端返回的入站 SSO 包。 */
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

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) {
        await cleanup();
    }
});

interface SetupResult {
    system: SystemService;
    commands: string[];
    /** 向客户端主动推送一个包。 */
    push: (command: string, body: Buffer) => void;
}

/** 启动一个可回放上线流程的测试服务器。 */
async function setup(registerMessage = 'register success'): Promise<SetupResult> {
    const appInfo = LINUX_APP_INFO;
    const deviceInfo = newDeviceInfo();
    const commands: string[] = [];
    let active: Socket | undefined;

    const server: Server = createServer((socket: Socket) => {
        active = socket;
        const reader = new SsoFrameReader();
        socket.on('data', (chunk) => {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            for (const frame of reader.push(buffer)) {
                const { command, sequence } = parseOutgoing(frame);
                commands.push(command);
                let reply: Buffer = Buffer.alloc(0);
                if (command === REGISTER_COMMAND) {
                    reply = SsoInfoSyncResponse.encode({ registerInfoResponse: { message: registerMessage } });
                } else if (command === FACE_COMMAND) {
                    reply = fetchFaceDetailsResponseContract.encode({
                        commonFace: { facePackList: [{ faces: [{ qSid: '1' }, { qSid: '2' }] }] },
                    });
                } else if (command === HIGHWAY_COMMAND) {
                    reply = FetchHighwayUrlResponse.encode({
                        body: {
                            sigSession: Buffer.from('sig'),
                            serverInfos: [{ serviceType: 1, serverAddrs: [{ ip: 0x04030201, port: 443 }] }],
                        },
                    });
                } else if (command === HEARTBEAT_COMMAND) {
                    reply = SsoHeartBeatResponse.encode({ interval: 60 });
                }
                socket.write(encodeSsoFrame(buildIncoming(command, sequence, reply)));
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
            a2: Buffer.alloc(0),
            d2: Buffer.alloc(0),
            d2Key: Buffer.alloc(0),
            subAppId: appInfo.SubAppId,
            guid: deviceInfo.guid.toString('hex'),
            version: appInfo.CurrentVersion,
        },
    });
    await transport.connect();

    const system = new SystemService({
        appInfo,
        deviceInfo,
        transport,
        oidb: new OidbService(transport),
        highway: new HighwayService(transport, appInfo.AppId),
    });
    cleanups.push(async () => {
        await system.offline().catch(() => undefined);
        system.dispose();
        transport.close();
        server.close();
    });
    return {
        system,
        commands,
        push: (command, body) => active?.write(encodeSsoFrame(buildIncoming(command, 9999, body))),
    };
}

describe('上线下线流程', () => {
    it('发送注册包后依次拉取表情与高速通道', async () => {
        const { system, commands } = await setup();
        await system.online();
        expect(commands).toEqual([REGISTER_COMMAND, FACE_COMMAND, HIGHWAY_COMMAND]);
        expect([...system.faceDetails.keys()]).toEqual(['1', '2']);
    });

    it('注册未成功时抛出错误', async () => {
        const { system } = await setup('register failed');
        await expect(system.online()).rejects.toThrow('上线失败');
    });

    it('心跳与下线各自发送对应命令', async () => {
        const { system, commands } = await setup();
        await system.online();
        await system.heartbeat();
        await system.offline();
        expect(commands).toContain(HEARTBEAT_COMMAND);
        expect(commands).toContain(UNREGISTER_COMMAND);
    });

    it('收到 KickNT 推送时触发被踢下线回调', async () => {
        const { system, push } = await setup();
        await system.online();
        const kicked = new Promise<KickInfo>((resolve) => system.onKick(resolve));
        push(
            'trpc.qq_new_tech.status_svc.StatusService.KickNT',
            KickNTReq.encode({ tipsTitle: '下线通知', tipsInfo: '账号在其它设备登录' }),
        );
        await expect(kicked).resolves.toEqual({ title: '下线通知', tip: '账号在其它设备登录' });
    });
});
