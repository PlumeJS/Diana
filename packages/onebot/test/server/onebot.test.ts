import type { AddressInfo } from 'node:net';
import { MessageType } from '@diana/core';
import type { IncomingMessage } from '@diana/core';
import { WebSocket, WebSocketServer } from 'ws';
import { afterEach, describe, expect, it } from 'vitest';
import type { OneBotContext } from '../../src/ctx.js';
import { OneBotServer } from '../../src/server/index.js';

interface FakeContext {
    ctx: OneBotContext;
    handlers: { message?: (message: IncomingMessage) => void; notify?: (notification: unknown) => void };
}

function createFakeContext(): FakeContext {
    const handlers: FakeContext['handlers'] = {};
    const ctx = {
        selfId: 10000,
        transport: { isConnected: true },
        message: {
            onMessage: (handler: (message: IncomingMessage) => void) => {
                handlers.message = handler;
            },
            offMessage: () => undefined,
        },
        notify: {
            onNotify: (handler: (notification: unknown) => void) => {
                handlers.notify = handler;
            },
            offNotify: () => undefined,
        },
        friend: { fetchFriends: async () => ({ friends: [], categories: [] }) },
        group: { fetchGroups: async () => [], fetchGroupMembers: async () => ({ members: [] }) },
        user: { fetchUserInfo: async () => ({ uin: 20001, nickname: 'Alice' }) },
        media: {},
        groupFile: {},
        highway: {},
    } as unknown as OneBotContext;
    return { ctx, handlers };
}

function collect(socket: WebSocket) {
    const queue: string[] = [];
    const waiters: Array<(value: string) => void> = [];
    socket.on('message', (data) => {
        const text = data.toString();
        const waiter = waiters.shift();
        if (waiter) {
            waiter(text);
        } else {
            queue.push(text);
        }
    });
    return {
        next(): Promise<string> {
            const queued = queue.shift();
            return queued !== undefined ? Promise.resolve(queued) : new Promise((resolve) => waiters.push(resolve));
        },
    };
}

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) {
        await cleanup();
    }
});

describe('OneBot 服务端', () => {
    it('正向 WS：连接后下发生命周期事件并处理 action', async () => {
        const { ctx } = createFakeContext();
        const server = new OneBotServer(ctx, { forwardWs: { host: '127.0.0.1', port: 0 } });
        await server.start();
        cleanups.push(() => server.stop());
        const port = server.forwardAddress!.port;

        const socket = new WebSocket(`ws://127.0.0.1:${port}`);
        const reader = collect(socket);
        cleanups.push(() => socket.close());
        await new Promise<void>((resolve) => socket.on('open', () => resolve()));

        expect(JSON.parse(await reader.next())).toMatchObject({ post_type: 'meta_event', meta_event_type: 'lifecycle' });

        socket.send(JSON.stringify({ action: 'get_login_info', echo: 'e1' }));
        const response = JSON.parse(await reader.next()) as {
            status: string;
            data: { user_id: number; nickname: string };
            echo: string;
        };
        expect(response.status).toBe('ok');
        expect(response.data.user_id).toBe(10000);
        expect(response.data.nickname).toBe('Alice');
        expect(response.echo).toBe('e1');
    });

    it('正向 WS：派发消息事件', async () => {
        const { ctx, handlers } = createFakeContext();
        const server = new OneBotServer(ctx, { forwardWs: { host: '127.0.0.1', port: 0 } });
        await server.start();
        cleanups.push(() => server.stop());
        const port = server.forwardAddress!.port;

        const socket = new WebSocket(`ws://127.0.0.1:${port}`);
        const reader = collect(socket);
        cleanups.push(() => socket.close());
        await new Promise<void>((resolve) => socket.on('open', () => resolve()));
        await reader.next(); // 生命周期

        handlers.message!({
            type: MessageType.GroupMessage,
            time: 1700000000,
            senderUin: 20001,
            targetUin: 10000,
            senderName: 'Alice',
            groupUin: 888,
            sequence: 42,
            segments: [{ type: 'text', content: 'hi' }],
        });

        const event = JSON.parse(await reader.next()) as { post_type: string; message_type: string; raw_message: string };
        expect(event).toMatchObject({ post_type: 'message', message_type: 'group', raw_message: 'hi' });
    });

    it('HTTP API：处理 action 请求', async () => {
        const { ctx } = createFakeContext();
        const server = new OneBotServer(ctx, { http: { host: '127.0.0.1', port: 0 } });
        await server.start();
        cleanups.push(() => server.stop());

        const response = await fetch(`http://127.0.0.1:${server.httpAddress!.port}/get_login_info`, {
            method: 'POST',
            body: '{}',
        });
        const body = (await response.json()) as { status: string; data: { user_id: number } };
        expect(body.status).toBe('ok');
        expect(body.data.user_id).toBe(10000);
    });

    it('HTTP API：未知 action 返回失败', async () => {
        const { ctx } = createFakeContext();
        const server = new OneBotServer(ctx, { http: { host: '127.0.0.1', port: 0 } });
        await server.start();
        cleanups.push(() => server.stop());

        const response = await fetch(`http://127.0.0.1:${server.httpAddress!.port}/unknown_action`, {
            method: 'POST',
            body: '{}',
        });
        const body = (await response.json()) as { status: string; retcode: number };
        expect(body.status).toBe('failed');
        expect(body.retcode).toBe(1404);
    });

    it('反向 WS：连接对端并处理 action', async () => {
        const { ctx } = createFakeContext();
        const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
        await new Promise<void>((resolve) => wss.on('listening', () => resolve()));
        const url = `ws://127.0.0.1:${(wss.address() as AddressInfo).port}`;

        const connected = new Promise<{ socket: WebSocket; first: string }>((resolve) => {
            wss.on('connection', (socket) => {
                socket.once('message', (data) => resolve({ socket, first: data.toString() }));
            });
        });

        const server = new OneBotServer(ctx, { reverseWs: [url] });
        await server.start();
        cleanups.push(() => server.stop());
        cleanups.push(() => new Promise<void>((resolve) => wss.close(() => resolve())));

        const { socket, first } = await connected;
        expect(JSON.parse(first)).toMatchObject({ post_type: 'meta_event', meta_event_type: 'lifecycle' });

        const response = new Promise<string>((resolve) => socket.once('message', (data) => resolve(data.toString())));
        socket.send(JSON.stringify({ action: 'get_login_info', echo: 'r1' }));
        const parsed = JSON.parse(await response) as { status: string; data: { user_id: number }; echo: string };
        expect(parsed.status).toBe('ok');
        expect(parsed.data.user_id).toBe(10000);
        expect(parsed.echo).toBe('r1');
    });
});
