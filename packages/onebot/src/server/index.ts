import { createServer } from 'node:http';
import type { IncomingMessage as HttpRequest, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createLogger, paint, paintColor } from '@diana/core';
import { MessageType } from '@diana/core';
import type { IncomingMessage, IncomingSegment, Notification } from '@diana/core';
import { WebSocket, WebSocketServer } from 'ws';
import type { RawData } from 'ws';
import type { ApiRequest, ApiResponse } from '../api/types.js';
import type { OneBotContext } from '../ctx.js';
import { UidDirectory } from '../directory.js';
import { toHeartbeatEvent, toLifecycleEvent, toMessageEvent, toNoticeEvent, toRequestEvent } from '../event/convert.js';
import type { Ob11Event } from '../event/types.js';
import type { Segment } from '../message/segment.js';
import { handleAction } from './actions.js';
import type { OneBotConfig } from './config.js';

const RECONNECT_DELAY = 5000;

/** 日志中展示的关键参数，避免打印媒体等大字段。 */
const LOG_PARAM_KEYS = ['message_type', 'group_id', 'user_id', 'message_id'] as const;

/** 汇总动作请求的关键参数。 */
function describeParams(params: Record<string, unknown>): string {
    const parts = LOG_PARAM_KEYS.filter((key) => params[key] !== undefined).map((key) => `${key}=${String(params[key])}`);
    return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

/** 单条消息段的预览文本。 */
function previewSegment(segment: Segment): string {
    switch (segment.type) {
        case 'text':
            return segment.data.text;
        case 'at':
            return `@${segment.data.qq}`;
        case 'reply':
            return '[回复]';
        case 'face':
            return `[表情${segment.data.id}]`;
        case 'image':
            return `[图片]`;
        case 'record':
            return `[语音]`;
        case 'video':
            return `[视频]`;
        case 'json':
            return `[JSON]`;
        case 'forward':
            return `[合并转发]`;
        case 'file':
            return `[文件]`;
        default:
            return `[${segment.type}]`;
    }
}

/** 消息内容预览（message 可能是段数组，也可能是 CQ 码字符串）。 */
function previewContent(message: Segment[] | string): string {
    const text = typeof message === 'string' ? message : message.map(previewSegment).join('');
    return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

/** 事件的一行摘要，用于终端日志（对齐 milky/acidify 展示风格：方向箭头 + [群] [发送者] 内容）。 */
function describeEvent(event: Ob11Event): string {
    switch (event.post_type) {
        case 'message':
        case 'message_sent': {
            const sender = `${event.sender.nickname}(${event.user_id})`;
            const content = previewContent(event.message);
            if (event.group_id !== undefined) {
                const arrow = event.post_type === 'message_sent' ? '->' : '<-';
                return `${arrow} [${paint.group(event.group_id)}] [${paint.sender(sender)}] ${content}`;
            }
            return event.post_type === 'message_sent' ? `-> ${paint.sender(sender)} ${content}` : `<- ${paint.sender(sender)} ${content}`;
        }
        case 'notice': {
            const scope = event.group_id !== undefined ? `[${paint.group(event.group_id)}] ` : '';
            return `${scope}${describeNotice(event)}`;
        }
        case 'request': {
            const scope = event.group_id !== undefined ? `[${paint.group(event.group_id)}] ` : '';
            return `${scope}${event.request_type} 请求 ${paint.sender(event.user_id)}${event.comment ? ` 附言：${event.comment}` : ''}`;
        }
        case 'meta_event':
            return `${event.meta_event_type}`;
    }
}

/** 事件分类标签：用具体文案替换通用「收到事件」，并按来源稳定着色。 */
function eventLabelTag(event: Ob11Event): string {
    switch (event.post_type) {
        case 'message':
        case 'message_sent':
            return event.group_id !== undefined ? paintColor('cyan', '群消息') : paintColor('magenta', '好友消息');
        case 'notice':
            return event.group_id !== undefined ? paintColor('cyan', '群通知') : paintColor('magenta', '好友通知');
        case 'request':
            return event.group_id !== undefined ? paintColor('cyan', '群请求') : paintColor('magenta', '好友请求');
        case 'meta_event':
            return paint.dim('元事件');
    }
}

/** 通知事件的补充摘要（配色对齐 milky：人名亮绿、关键值亮黄）。 */
function describeNotice(event: Extract<Ob11Event, { post_type: 'notice' }>): string {
    if (event.notice_type === 'notify' && 'sub_type' in event && event.sub_type === 'poke') {
        const action = event.action ?? '戳了戳';
        const target = 'target_id' in event ? event.target_id : undefined;
        return `${paint.sender(event.user_id)} ${action} ${target !== undefined ? paint.sender(target) : ''}`.trim();
    }
    if (event.notice_type === 'group_recall') {
        const name = event.nickname ? `${event.nickname}(${event.user_id})` : String(event.user_id);
        return `${paint.sender(name)} 撤回了一条消息 [${event.message_id}]（操作者 ${paint.sender(event.operator_id)}）`;
    }
    if (event.notice_type === 'friend_recall') {
        const name = event.nickname ? `${event.nickname}(${event.user_id})` : String(event.user_id);
        return `${paint.sender(name)} 撤回了一条消息 [${event.message_id}]`;
    }
    if (event.notice_type === 'group_increase') {
        const by = event.operator_id ? `（操作者 ${paint.sender(event.operator_id)}）` : '';
        return `${paint.sender(event.user_id)} ${'sub_type' in event && event.sub_type === 'invite' ? '被邀请加入' : '加入了'}群组${by}`;
    }
    if (event.notice_type === 'group_decrease') {
        const sub = 'sub_type' in event ? event.sub_type : '';
        const verb = sub === 'kick_me' ? '被移出（我方）' : sub === 'leave' ? '退出了' : '被移出了';
        const by = event.operator_id ? `（操作者 ${paint.sender(event.operator_id)}）` : '';
        return `${paint.sender(event.user_id)} ${verb}群组${by}`;
    }
    if (event.notice_type === 'group_ban') {
        const sub = 'sub_type' in event ? event.sub_type : '';
        return sub === 'ban'
            ? `${paint.sender(event.user_id)} 被 ${paint.sender(event.operator_id)} 禁言 ${paint.highlight(event.duration)} 秒`
            : `${paint.sender(event.user_id)} 被 ${paint.sender(event.operator_id)} 解除禁言`;
    }
    if (event.notice_type === 'group_reaction') {
        return `${paint.sender(event.operator_id)} ${event.sub_type === 'add' ? '贴上了' : '取消了'}表情 ${paint.highlight(event.code)} 到消息 [${event.message_id}]`;
    }
    if (event.notice_type === 'essence') {
        return `消息 [${event.message_id}] 被 ${paint.sender(event.operator_id)} ${event.sub_type === 'add' ? '设为' : '移出'}精华（发送者 ${paint.sender(event.sender_id)}）`;
    }
    if (event.notice_type === 'group_admin') {
        return `${paint.sender(event.user_id)} ${event.sub_type === 'set' ? '成为' : '不再担任'}管理员`;
    }
    if (event.notice_type === 'group_name_change') {
        return `群名被 ${paint.sender(event.operator_id)} 改为「${paint.highlight(event.name)}」`;
    }
    return 'sub_type' in event && typeof event.sub_type === 'string' ? event.sub_type : '';
}

function readBody(req: HttpRequest): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

/** OneBot 11 服务端：正向/反向 WebSocket 与 HTTP API。 */
export class OneBotServer {
    private readonly log: ReturnType<typeof createLogger>;
    private readonly directory: UidDirectory;
    private readonly forwardClients = new Set<WebSocket>();
    private readonly reverseClients = new Set<WebSocket>();
    private readonly reverseTimers = new Set<NodeJS.Timeout>();
    private forwardServer?: Server;
    private httpServer?: Server;
    private wss?: WebSocketServer;
    private heartbeatTimer?: NodeJS.Timeout;
    private running = false;

    /** 正向 WS 实际监听地址。 */
    forwardAddress?: AddressInfo;
    /** HTTP API 实际监听地址。 */
    httpAddress?: AddressInfo;

    private readonly onMessage = (message: IncomingMessage): void => {
        if (message.senderUin === this.ctx.selfId) {
            return; // 不推送自身消息事件
        }
        this.directory.remember(message.senderUid, message.senderUin);
        // 对齐 acidify：媒体段现场调 oidb 200 换取带新鲜 rkey 的下载 URL，避免透传过期 rkey
        const resolveUrl = async (segment: IncomingSegment) => {
            const media = this.ctx.media;
            const indexNode =
                segment.type === 'image' ? segment.indexNode
                : segment.type === 'record' ? segment.indexNode
                : segment.type === 'video' ? segment.indexNode
                : undefined;
            if (!indexNode) {
                return undefined;
            }
            try {
                if (message.type === MessageType.GroupMessage && message.groupUin !== undefined) {
                    if (segment.type === 'image') {
                        return await media.getGroupImageDownloadUrl(indexNode);
                    }
                    if (segment.type === 'record') {
                        return await media.getGroupRecordDownloadUrl(indexNode);
                    }
                    if (segment.type === 'video') {
                        return await media.getGroupVideoDownloadUrl(indexNode);
                    }
                } else if (message.type === MessageType.PrivateMessage && message.senderUid) {
                    if (segment.type === 'image') {
                        return await media.getPrivateImageDownloadUrl(message.senderUid, indexNode);
                    }
                    if (segment.type === 'record') {
                        return await media.getPrivateRecordDownloadUrl(message.senderUid, indexNode);
                    }
                    if (segment.type === 'video') {
                        return await media.getPrivateVideoDownloadUrl(message.senderUid, indexNode);
                    }
                }
            } catch (error) {
                this.log.warn('解析媒体下载 URL 失败', error);
            }
            return undefined;
        };
        void toMessageEvent(
            message,
            this.ctx.selfId,
            resolveUrl,
            (uid, groupUin) => this.directory.resolveName(uid, groupUin),
        ).then(
            (event) => this.dispatch(event),
            (error) => this.log.warn('转换消息事件失败', error),
        );
    };

    private readonly onNotify = (notification: Notification): void => {
        void this.handleNotify(notification);
    };

    constructor(
        private readonly ctx: OneBotContext,
        private readonly config: OneBotConfig,
    ) {
        this.log = createLogger('OneBot');
        this.directory = new UidDirectory(ctx);
    }

    private async handleNotify(notification: Notification): Promise<void> {
        const notice = await toNoticeEvent(
            notification,
            this.ctx.selfId,
            (uid, groupUin) => this.directory.resolve(uid, groupUin),
            (uid, groupUin) => this.directory.resolveName(uid, groupUin),
        );
        if (notice) {
            this.dispatch(notice);
        }
        const request = toRequestEvent(notification, this.ctx.selfId);
        if (request) {
            this.dispatch(request);
        }
    }

    /** 启动服务。 */
    async start(): Promise<void> {
        if (this.running) {
            return;
        }
        this.running = true;
        this.ctx.message.onMessage(this.onMessage);
        this.ctx.notify.onNotify(this.onNotify);
        if (this.config.forwardWs) {
            await this.startForwardWs();
        }
        if (this.config.http) {
            await this.startHttp();
        }
        for (const url of this.config.reverseWs ?? []) {
            this.connectReverse(url);
        }
        const interval = this.config.heartbeatInterval ?? 0;
        if (interval > 0) {
            this.heartbeatTimer = setInterval(() => this.dispatch(toHeartbeatEvent(this.ctx.selfId, interval)), interval);
        }
    }

    /** 停止服务。 */
    async stop(): Promise<void> {
        this.running = false;
        this.ctx.message.offMessage(this.onMessage);
        this.ctx.notify.offNotify(this.onNotify);
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }
        for (const timer of this.reverseTimers) {
            clearTimeout(timer);
        }
        this.reverseTimers.clear();
        for (const socket of [...this.forwardClients, ...this.reverseClients]) {
            socket.close();
        }
        this.forwardClients.clear();
        this.reverseClients.clear();
        this.wss?.close();
        await Promise.all([this.closeServer(this.forwardServer), this.closeServer(this.httpServer)]);
    }

    private startForwardWs(): Promise<void> {
        const { host = '0.0.0.0', port } = this.config.forwardWs!;
        const server = createServer((_req, res) => {
            res.writeHead(404);
            res.end();
        });
        const wss = new WebSocketServer({ server });
        wss.on('connection', (socket, req) => {
            if (!this.authorized(req)) {
                socket.close();
                return;
            }
            this.forwardClients.add(socket);
            socket.send(JSON.stringify(toLifecycleEvent(this.ctx.selfId)));
            socket.on('message', (data) => void this.onClientMessage(socket, data));
            socket.on('close', () => this.forwardClients.delete(socket));
            socket.on('error', (error) => this.log.warn('正向 WS 连接错误', error));
        });
        this.forwardServer = server;
        this.wss = wss;
        return new Promise((resolve) => {
            server.listen(port, host, () => {
                this.forwardAddress = server.address() as AddressInfo;
                this.log.info(`正向 WS 监听 ${host}:${this.forwardAddress.port}`);
                resolve();
            });
        });
    }

    private startHttp(): Promise<void> {
        const { host = '0.0.0.0', port } = this.config.http!;
        const server = createServer((req, res) => void this.onHttpRequest(req, res));
        this.httpServer = server;
        return new Promise((resolve) => {
            server.listen(port, host, () => {
                this.httpAddress = server.address() as AddressInfo;
                this.log.info(`HTTP API 监听 ${host}:${this.httpAddress.port}`);
                resolve();
            });
        });
    }

    private connectReverse(url: string): void {
        if (!this.running) {
            return;
        }
        const socket = new WebSocket(url, {
            headers: this.config.accessToken ? { Authorization: `Bearer ${this.config.accessToken}` } : {},
        });
        socket.on('open', () => {
            this.reverseClients.add(socket);
            socket.send(JSON.stringify(toLifecycleEvent(this.ctx.selfId)));
            this.log.info(`反向 WS 已连接 ${url}`);
        });
        socket.on('message', (data) => void this.onClientMessage(socket, data));
        socket.on('close', () => {
            this.reverseClients.delete(socket);
            if (this.running) {
                const timer = setTimeout(() => {
                    this.reverseTimers.delete(timer);
                    this.connectReverse(url);
                }, RECONNECT_DELAY);
                this.reverseTimers.add(timer);
            }
        });
        socket.on('error', (error) => this.log.warn(`反向 WS 错误 ${url}`, error));
    }

    private async onClientMessage(socket: WebSocket, data: RawData): Promise<void> {
        let request: ApiRequest;
        try {
            request = JSON.parse(data.toString()) as ApiRequest;
        } catch {
            return;
        }
        if (typeof request.action !== 'string') {
            return;
        }
        const response = await this.callAction(request.action, (request.params ?? {}) as Record<string, unknown>);
        if (request.echo !== undefined) {
            response.echo = request.echo;
        }
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(response));
        }
    }

    private async onHttpRequest(req: HttpRequest, res: ServerResponse): Promise<void> {
        if (!this.authorized(req)) {
            this.writeJson(res, 401, { status: 'failed', retcode: 1401, data: null, message: 'unauthorized' });
            return;
        }
        if (req.method !== 'POST') {
            this.writeJson(res, 405, { status: 'failed', retcode: 1405, data: null, message: 'method not allowed' });
            return;
        }
        const action = new URL(req.url ?? '/', 'http://localhost').pathname.replace(/^\/+/, '');
        let params: Record<string, unknown> = {};
        try {
            const body = await readBody(req);
            if (body) {
                params = JSON.parse(body) as Record<string, unknown>;
            }
        } catch {
            this.writeJson(res, 400, { status: 'failed', retcode: 1400, data: null, message: 'invalid body' });
            return;
        }
        this.writeJson(res, 200, await this.callAction(action, params));
    }

    /** 执行动作并记录一行调用日志（对齐 milky：来源 + 状态 + 耗时）。 */
    private async callAction(action: string, params: Record<string, unknown>): Promise<ApiResponse> {
        const start = Date.now();
        try {
            const response = await handleAction(this.ctx, action, params);
            const elapsed = Date.now() - start;
            if (response.status === 'ok') {
                this.log.info(paint.dim(`调用 API ${action}${describeParams(params)} → 成功 ${elapsed}ms`));
            } else {
                this.log.warn(`调用 API ${action}${describeParams(params)} → 失败: ${response.message ?? response.status}`);
            }
            return response;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.log.warn(`调用 API ${action}${describeParams(params)} → 失败: ${message}`);
            return { status: 'failed', retcode: 1500, data: null, message };
        }
    }

    private dispatch(event: Ob11Event): void {
        if (event.post_type !== 'meta_event' || event.meta_event_type !== 'heartbeat') {
            this.log.info(`${eventLabelTag(event)} ${describeEvent(event)}`);
        }
        const json = JSON.stringify(event);
        for (const socket of [...this.forwardClients, ...this.reverseClients]) {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(json);
            }
        }
        for (const url of this.config.httpPost ?? []) {
            void this.postEvent(url, json);
        }
    }

    private async postEvent(url: string, json: string): Promise<void> {
        try {
            await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.config.accessToken ? { Authorization: `Bearer ${this.config.accessToken}` } : {}),
                },
                body: json,
            });
        } catch (error) {
            this.log.warn(`HTTP POST 上报失败 ${url}`, error);
        }
    }

    private authorized(req: HttpRequest): boolean {
        const token = this.config.accessToken;
        if (!token) {
            return true;
        }
        if (req.headers.authorization === `Bearer ${token}`) {
            return true;
        }
        return new URL(req.url ?? '/', 'http://localhost').searchParams.get('access_token') === token;
    }

    private writeJson(res: ServerResponse, status: number, body: unknown): void {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
    }

    private closeServer(server?: Server): Promise<void> {
        return new Promise((resolve) => {
            if (server) {
                server.close(() => resolve());
            } else {
                resolve();
            }
        });
    }
}