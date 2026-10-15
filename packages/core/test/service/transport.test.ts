import { createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
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
import { SsoTransport } from '../../src/service/index.js';
import type { PushPacket, SignProvider, SsoSession } from '../../src/service/index.js';
import { SsoReserveFields } from '../../src/packet/reserve-fields.js';
import { decodeTlv, encodeTlv } from '../../src/tlv/index.js';
import type { TlvData } from '../../src/tlv/index.js';

/** 解析客户端发送的入站（对本服务器而言）SSO 包。 */
function parseOutgoing(frame: Buffer): { command: string; sequence: number; body: Buffer; reserve: Buffer } {
    const wrapper = decodeTlv(outgoingSsoPacketWrapperSchema, frame);
    const inner = decodeTlv(outgoingSsoPacketSchema, decryptTea(wrapper['encrypted'] as Buffer, EMPTY_TEA_KEY));
    const header = inner['header'] as TlvData;
    return {
        command: header['command'] as string,
        sequence: header['sequence'] as number,
        body: inner['body'] as Buffer,
        reserve: header['ssoReserveFields'] as Buffer,
    };
}

/** 构造一个可被传输层解析的入站 SSO 包（空密钥加密）。 */
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
        uin: '10000',
        packet: encryptTea(inner, EMPTY_TEA_KEY),
    });
}

function createSession(): SsoSession {
    return {
        uin: '10000',
        a2: Buffer.from('a2'),
        d2: Buffer.alloc(0),
        d2Key: Buffer.alloc(0),
        subAppId: 1,
        guid: 'abcdef',
        version: '9.9.9',
    };
}

type RequestHandler = (
    socket: Socket,
    packet: { command: string; sequence: number; body: Buffer; reserve: Buffer },
) => void;

const cleanups: Array<() => void> = [];

afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
        cleanup();
    }
});

async function setup(
    handler: RequestHandler,
    options: { timeout?: number; signProvider?: SignProvider } = {},
): Promise<SsoTransport> {
    const server: Server = createServer((socket) => {
        const reader = new SsoFrameReader();
        socket.on('data', (chunk) => {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            for (const frame of reader.push(buffer)) {
                handler(socket, parseOutgoing(frame));
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
        session: createSession(),
        timeout: options.timeout,
        signProvider: options.signProvider,
    });
    await transport.connect();

    cleanups.push(() => {
        transport.close();
        server.close();
    });
    return transport;
}

describe('SsoTransport', () => {
    it('sends a packet and resolves with the response body', async () => {
        const transport = await setup((socket, packet) => {
            socket.write(encodeSsoFrame(buildIncoming(packet.command, packet.sequence, Buffer.from('pong'))));
        });

        const response = await transport.send('test.cmd', Buffer.from('ping'));
        expect('body' in response).toBe(true);
        if ('body' in response) {
            expect(response.command).toBe('test.cmd');
            expect(response.body.toString()).toBe('pong');
        }
    });

    it('断线后触发 onClose，并可重新连接继续收发', async () => {
        const sockets: Socket[] = [];
        const transport = await setup((socket, packet) => {
            sockets.push(socket);
            socket.write(encodeSsoFrame(buildIncoming(packet.command, packet.sequence, Buffer.from('pong'))));
        });

        await transport.send('test.cmd', Buffer.from('ping'));
        const closed = new Promise<void>((resolve) => transport.onClose(resolve));
        sockets[0]?.destroy();
        await closed;
        expect(transport.isConnected).toBe(false);

        await transport.connect();
        expect(transport.isConnected).toBe(true);
        const response = await transport.send('test.cmd', Buffer.from('ping'));
        expect('body' in response).toBe(true);
    });

    it('为白名单命令附加签名，非白名单命令不签名', async () => {
        const signed: Array<{ cmd: string; src: string; seq: number }> = [];
        const reserves: Buffer[] = [];
        const signProvider: SignProvider = {
            async sign(cmd, src, seq) {
                signed.push({ cmd, src: src.toString('hex'), seq });
                return {
                    sign: Buffer.from('aa', 'hex'),
                    token: Buffer.from('bb', 'hex'),
                    extra: Buffer.from('cc', 'hex'),
                };
            },
        };
        const transport = await setup(
            (socket, packet) => {
                reserves.push(packet.reserve);
                socket.write(encodeSsoFrame(buildIncoming(packet.command, packet.sequence, Buffer.from('pong'))));
            },
            { signProvider },
        );

        await transport.send('wtlogin.login', Buffer.from('0102', 'hex'));
        await transport.send('test.cmd', Buffer.from('0304', 'hex'));

        expect(signed).toEqual([{ cmd: 'wtlogin.login', src: '0102', seq: 4000 }]);
        expect(SsoReserveFields.decode(reserves[0]).secureInfo).toEqual({
            sign: Buffer.from('aa', 'hex'),
            token: Buffer.from('bb', 'hex'),
            extra: Buffer.from('cc', 'hex'),
        });
        expect(SsoReserveFields.decode(reserves[1]).secureInfo).toBeUndefined();
    });

    it('emits pushed packets while resolving responses', async () => {
        const transport = await setup((socket, packet) => {
            socket.write(encodeSsoFrame(buildIncoming('push.cmd', 9999, Buffer.from('event'))));
            socket.write(encodeSsoFrame(buildIncoming(packet.command, packet.sequence, Buffer.from('pong'))));
        });

        const pushed = new Promise<PushPacket>((resolve) => transport.onPush(resolve));
        const response = await transport.send('test.cmd', Buffer.from('ping'));

        const pushPacket = await pushed;
        expect(pushPacket.command).toBe('push.cmd');
        expect(pushPacket.sequence).toBe(9999);
        expect(pushPacket.body.toString()).toBe('event');
        expect('body' in response && response.body.toString()).toBe('pong');
    });

    it('rejects when the server does not respond in time', async () => {
        const transport = await setup(() => {}, { timeout: 100 });
        await expect(transport.send('test.cmd', Buffer.alloc(0))).rejects.toThrow(/超时/);
    });

    it('rejects pending requests when the connection closes', async () => {
        const transport = await setup((socket) => socket.destroy());
        await expect(transport.send('test.cmd', Buffer.alloc(0))).rejects.toThrow(/连接已关闭/);
    });

    it('throws when sending before connecting', async () => {
        const transport = new SsoTransport({ host: '127.0.0.1', port: 1, session: createSession() });
        await expect(transport.send('test.cmd', Buffer.alloc(0))).rejects.toThrow(/连接尚未建立/);
    });
});
