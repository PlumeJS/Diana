import { Socket } from 'node:net';
import { DianaError, ErrorCode } from '../common/errors.js';
import { createLogger } from '../common/logger.js';
import type { Logger } from '../common/logger.js';
import { decodeSsoPacket, encodeSsoPacket } from '../packet/codec.js';
import type { IncomingSsoPacket } from '../packet/codec.js';
import { encodeSsoFrame, SsoFrameReader } from '../packet/frame.js';
import { EncryptionType } from '../packet/sso.js';
import { SsoReserveFields } from '../packet/reserve-fields.js';
import { generateTrace } from '../util/format.js';
import { SIGN_COMMANDS } from './sign.js';
import type { SignProvider, SignResult } from './sign.js';

/** SSO 会话状态，随登录流程更新。 */
export interface SsoSession {
    /** 当前账号 uin。 */
    uin: string;
    /** 当前账号 uid。 */
    uid?: string;
    /** 会话 a2 令牌。 */
    a2: Buffer;
    /** 会话 d2。 */
    d2: Buffer;
    /** 会话 d2Key。 */
    d2Key: Buffer;
    /** 子 AppId。 */
    subAppId: number;
    /** 设备 guid（十六进制字符串）。 */
    guid: string;
    /** 客户端版本号。 */
    version: string;
}

/** 连接配置。 */
export interface SsoTransportOptions {
    host: string;
    port: number;
    session: SsoSession;
    /** 请求超时（毫秒），默认 15000。 */
    timeout?: number;
    /** 签名提供者，缺省时不签名。 */
    signProvider?: SignProvider;
    logger?: Logger;
}

/** 服务器主动推送的包。 */
export interface PushPacket {
    command: string;
    sequence: number;
    body: Buffer;
}

/** 推送处理器。 */
export type PushHandler = (packet: PushPacket) => void;

interface Pending {
    resolve: (packet: IncomingSsoPacket) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
}

/** 序号基数。 */
const SEQUENCE_BASE = 4000;

/** 基于 TCP 的 SSO 传输层。 */
export class SsoTransport {
    private socket?: Socket;
    private readonly frames = new SsoFrameReader();
    private readonly pending = new Map<number, Pending>();
    private readonly pushHandlers = new Set<PushHandler>();
    private readonly closeHandlers = new Set<() => void>();
    private readonly logger: Logger;
    private readonly timeout: number;
    private sequence = SEQUENCE_BASE;

    private connected = false;

    constructor(private readonly options: SsoTransportOptions) {
        this.logger = options.logger ?? createLogger('SsoTransport');
        this.timeout = options.timeout ?? 15000;
    }

    /** 当前会话状态（可被登录流程修改）。 */
    get session(): SsoSession {
        return this.options.session;
    }

    /** 是否已建立连接。 */
    get isConnected(): boolean {
        return this.connected;
    }

    /** 建立连接，断线后可重复调用。 */
    connect(): Promise<void> {
        const socket = new Socket();
        this.socket = socket;
        this.frames.reset();
        socket.on('data', (chunk) => this.onData(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        socket.on('close', () => this.handleClose());
        socket.on('error', (error) => this.logger.error('连接出现错误', error));
        return new Promise((resolve, reject) => {
            const onError = (error: Error): void => {
                socket.off('error', onError);
                reject(error);
            };
            socket.once('error', onError);
            socket.connect(this.options.port, this.options.host, () => {
                socket.off('error', onError);
                this.connected = true;
                this.logger.debug(`已连接 ${this.options.host}:${this.options.port}`);
                resolve();
            });
        });
    }

    /** 发送数据包并等待响应。 */
    async send(command: string, body: Buffer, encryption?: EncryptionType): Promise<IncomingSsoPacket> {
        const sequence = this.sequence++;
        const frame = await this.buildFrame(command, body, sequence, encryption);
        return new Promise<IncomingSsoPacket>((resolve, reject) => {
            if (!this.connected) {
                reject(new DianaError(ErrorCode.Network, '连接尚未建立'));
                return;
            }
            const timer = setTimeout(() => {
                this.pending.delete(sequence);
                reject(new DianaError(ErrorCode.Network, `发送数据包超时 (cmd=${command} seq=${sequence})`));
            }, this.timeout);
            this.pending.set(sequence, { resolve, reject, timer });
            this.socket?.write(frame);
        });
    }

    /** 发送数据包但不等待响应。 */
    async post(command: string, body: Buffer): Promise<void> {
        const frame = await this.buildFrame(command, body, this.sequence++);
        if (!this.connected) {
            throw new DianaError(ErrorCode.Network, '连接尚未建立');
        }
        this.socket?.write(frame);
    }

    /** 发送明文且不等待响应的数据包（如 Alive 保活）。 */
    sendSimple(command: string, body: Buffer): void {
        if (!this.connected) {
            return;
        }
        const frame = encodeSsoFrame(this.buildPacket(command, body, this.sequence++, undefined, EncryptionType.None));
        this.socket?.write(frame);
    }

    /** 注册推送处理器。 */
    onPush(handler: PushHandler): void {
        this.pushHandlers.add(handler);
    }

    /** 移除推送处理器。 */
    offPush(handler: PushHandler): void {
        this.pushHandlers.delete(handler);
    }

    /** 注册断线回调（已连接后断开时触发）。 */
    onClose(handler: () => void): void {
        this.closeHandlers.add(handler);
    }

    /** 移除断线回调。 */
    offClose(handler: () => void): void {
        this.closeHandlers.delete(handler);
    }

    /** 关闭连接。 */
    close(): void {
        this.connected = false;
        this.socket?.destroy();
        this.socket = undefined;
    }

    private async buildFrame(command: string, body: Buffer, sequence: number, encryption?: EncryptionType): Promise<Buffer> {
        this.logger.debug(`发送数据包 (cmd=${command}, seq=${sequence})`);
        const provider = this.options.signProvider;
        if (SIGN_COMMANDS.has(command)) {
            // 强制签名校验：需要签名的命令在无签名服务或签名为空时直接失败，避免无签名/坏签名包被发出
            if (!provider) {
                throw new DianaError(ErrorCode.Validation, `命令 ${command} 需要签名，但未配置签名服务器 (protocol.signServer)`);
            }
            const sign = await provider.sign(command, body, sequence);
            if (!sign.sign.length) {
                throw new DianaError(ErrorCode.Protocol, `签名服务返回的签名无效 (cmd=${command}，sign 为空)`);
            }
            return encodeSsoFrame(this.buildPacket(command, body, sequence, sign, encryption));
        }
        return encodeSsoFrame(this.buildPacket(command, body, sequence, undefined, encryption));
    }

    private buildPacket(command: string, body: Buffer, sequence: number, sign?: SignResult, encryption?: EncryptionType): Buffer {
        const { session } = this.options;
        return encodeSsoPacket({
            header: {
                sequence,
                subAppId: session.subAppId,
                a2: session.a2,
                command,
                guid: session.guid,
                version: session.version,
                ssoReserveFields: SsoReserveFields.encode({
                    traceParent: generateTrace(),
                    uid: session.uid,
                    secureInfo: sign,
                }),
            },
            body,
            uin: session.uin,
            d2: session.d2,
            d2Key: session.d2Key,
            encryption,
        });
    }

    private onData(chunk: Buffer): void {
        for (const frame of this.frames.push(chunk)) {
            this.handleFrame(frame);
        }
    }

    private handleFrame(frame: Buffer): void {
        let packet: IncomingSsoPacket;
        try {
            packet = decodeSsoPacket(frame, this.options.session.d2Key);
        } catch (error) {
            this.logger.error('解析数据包失败', error);
            return;
        }

        const pending = this.pending.get(packet.sequence);
        if (pending) {
            this.pending.delete(packet.sequence);
            clearTimeout(pending.timer);
            pending.resolve(packet);
            return;
        }

        if ('retcode' in packet) {
            this.logger.warn(
                `收到未匹配的错误响应 (cmd=${packet.command}, seq=${packet.sequence}, retcode=${packet.retcode})`,
            );
            return;
        }

        this.logger.debug(`收到推送 (cmd=${packet.command}, seq=${packet.sequence})`);
        for (const handler of this.pushHandlers) {
            try {
                handler(packet);
            } catch (error) {
                this.logger.error(`处理推送失败 (cmd=${packet.command})`, error);
            }
        }
    }

    private handleClose(): void {
        const wasConnected = this.connected;
        this.connected = false;
        this.frames.reset();
        for (const [sequence, pending] of this.pending) {
            clearTimeout(pending.timer);
            pending.reject(new DianaError(ErrorCode.Network, `连接已关闭 (seq=${sequence})`));
        }
        this.pending.clear();
        if (wasConnected) {
            for (const handler of this.closeHandlers) {
                handler();
            }
        }
    }
}
