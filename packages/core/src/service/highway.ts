import { request } from 'node:http';
import { connect } from 'node:net';
import { DianaError, ErrorCode } from '../common/errors.js';
import { createLogger } from '../common/logger.js';
import type { Logger } from '../common/logger.js';
import { md5 } from '../crypto/digest.js';
import { FetchHighwayUrl, FetchHighwayUrlResponse } from '../packet/httpconn.js';
import { ReqDataHighwayHead, RespDataHighwayHead } from '../packet/highway.js';
import { int32IpToString } from '../util/format.js';
import type { SsoTransport } from './transport.js';

const MAX_BLOCK_SIZE = 1024 * 1024;
const HIGHWAY_COMMAND = 'PicUp.DataUp';
const FRAME_START = 0x28;
const FRAME_END = 0x29;

/** 高速上传服务器。 */
export interface HighwayServer {
    ip: string;
    port: number;
}

interface HighwayTrans {
    uin: string;
    commandId: number;
    data: Buffer;
    sum: Buffer;
    ticket: Buffer;
    ext: Buffer;
    /** 登录签名（a2），高速通道鉴权必需。 */
    a2: Buffer;
    host: string;
    port: number;
}

/** 按块切分数据。 */
function splitBlocks(data: Buffer): Buffer[] {
    const blocks: Buffer[] = [];
    for (let offset = 0; offset < data.length; offset += MAX_BLOCK_SIZE) {
        blocks.push(data.subarray(offset, offset + MAX_BLOCK_SIZE));
    }
    return blocks;
}

/** 组帧：`0x28 + headLength(u32) + bodyLength(u32) + head + body + 0x29`。 */
function packFrame(head: Buffer, body: Buffer): Buffer {
    const frame = Buffer.allocUnsafe(9 + head.length + body.length + 1);
    frame[0] = FRAME_START;
    frame.writeUInt32BE(head.length, 1);
    frame.writeUInt32BE(body.length, 5);
    head.copy(frame, 9);
    body.copy(frame, 9 + head.length);
    frame[frame.length - 1] = FRAME_END;
    return frame;
}

/** 解帧，返回 head 与 body。 */
function unpackFrame(frame: Buffer): [Buffer, Buffer] {
    if (frame[0] !== FRAME_START || frame[frame.length - 1] !== FRAME_END) {
        throw new DianaError(ErrorCode.Network, '非法的高速通道帧');
    }
    const headLength = frame.readUInt32BE(1);
    const bodyLength = frame.readUInt32BE(5);
    return [frame.subarray(9, 9 + headLength), frame.subarray(9 + headLength, 9 + headLength + bodyLength)];
}

/** 构建上传请求头。 */
function buildHead(appId: number, trans: HighwayTrans, seq: number, offset: number, bodyLength: number, bodyMd5: Buffer): Buffer {
    return ReqDataHighwayHead.encode({
        msgBaseHead: {
            version: 1,
            uin: trans.uin,
            command: HIGHWAY_COMMAND,
            seq,
            retryTimes: 0,
            appId,
            dataFlag: 16,
            commandId: trans.commandId,
        },
        msgSegHead: {
            serviceId: 0,
            filesize: BigInt(trans.data.length),
            dataOffset: BigInt(offset),
            dataLength: bodyLength,
            serviceTicket: trans.ticket,
            md5: bodyMd5,
            fileMd5: trans.sum,
            cacheAddr: 0,
            cachePort: 0,
        },
        bytesReqExtendInfo: trans.ext,
        timestamp: 0n,
        msgLoginSigHead: { uint32LoginSigType: 8, bytesLoginSig: trans.a2, appId },
    });
}

/** 高速通道上传服务。 */
export class HighwayService {
    private host = '';
    private port = 0;
    private sigSession: Buffer = Buffer.alloc(0);
    private sequence = 0;
    private readonly logger: Logger;

    constructor(
        private readonly transport: SsoTransport,
        /** 当前协议的 AppId，需与会话票据一致，否则服务器拒绝上传。 */
        private readonly appId: number,
    ) {
        this.logger = createLogger('HighwayService');
    }

    /** 拉取高速上传服务器地址与票据。 */
    async fetchServer(): Promise<HighwayServer[]> {
        const response = await this.transport.send(
            'HttpConn.0x6ff_501',
            FetchHighwayUrl.encode({
                body: {
                    field3: 16,
                    field4: 1,
                    loginSigTicket: this.transport.session.a2,
                    field6: 3,
                    serviceTypes: [1, 5, 10, 21],
                    field9: 2,
                    field10: 9,
                    field11: 8,
                    ver: '1.0.1',
                },
            }),
        );
        if (!('body' in response)) {
            throw new DianaError(ErrorCode.Network, `拉取高速上传服务器失败 (retcode=${response.retcode}): ${response.extra}`);
        }
        const body = FetchHighwayUrlResponse.decode(response.body).body;
        this.sigSession = body.sigSession;
        const servers = body.serverInfos
            .filter((info) => info.serviceType === 1)
            .flatMap((info) => info.serverAddrs.map((addr) => ({ ip: int32IpToString(addr.ip), port: addr.port })));
        if (servers.length > 0) {
            const first = servers[0];
            if (first) {
                this.setServer(first.ip, first.port);
            }
        }
        return servers;
    }

    /** 设置当前使用的上传服务器。 */
    setServer(host: string, port: number): void {
        this.host = host;
        this.port = port;
    }

    /** 上传数据，优先 TCP，失败回退 HTTP。 */
    async upload(commandId: number, data: Buffer, sum: Buffer, ext: Buffer): Promise<void> {
        if (!this.host) {
            throw new DianaError(ErrorCode.Network, '尚未设置高速上传服务器');
        }
        const trans: HighwayTrans = {
            uin: this.transport.session.uin,
            commandId,
            data,
            sum,
            ticket: this.sigSession,
            ext,
            a2: this.transport.session.a2,
            host: this.host,
            port: this.port,
        };
        try {
            await this.uploadTcp(trans);
        } catch (error) {
            this.logger.warn('TCP 上传失败，回退 HTTP', error);
            await this.uploadHttp(trans);
        }
    }

    private nextSequence(): number {
        this.sequence = (this.sequence + 1) % 100000;
        return this.sequence;
    }

    private uploadTcp(trans: HighwayTrans): Promise<void> {
        return new Promise((resolve, reject) => {
            const socket = connect(trans.port, trans.host);
            let settled = false;
            let completed = false;
            const finish = (error?: Error): void => {
                if (settled) {
                    return;
                }
                settled = true;
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            };
            socket.on('connect', () => {
                let offset = 0;
                for (const block of splitBlocks(trans.data)) {
                    socket.write(packFrame(buildHead(this.appId, trans, this.nextSequence(), offset, block.length, md5(block)), block));
                    offset += block.length;
                }
            });
            let pending = Buffer.alloc(0);
            socket.on('data', (chunk) => {
                try {
                    // 多块上传时响应可能合并到达，需按帧长度循环切分
                    pending = Buffer.concat([pending, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
                    while (pending.length >= 9) {
                        const headLength = pending.readUInt32BE(1);
                        const bodyLength = pending.readUInt32BE(5);
                        const frameLength = 9 + headLength + bodyLength + 1;
                        if (pending.length < frameLength) {
                            return;
                        }
                        const frame = pending.subarray(0, frameLength);
                        pending = pending.subarray(frameLength);
                        const [head] = unpackFrame(frame);
                        const response = RespDataHighwayHead.decode(head);
                        if (response.errorCode !== 0) {
                            socket.end();
                            finish(new DianaError(ErrorCode.Network, `TCP 上传失败 (code=${response.errorCode})`));
                            return;
                        }
                        const seg = response.msgSegHead;
                        if (seg && Number(seg.dataOffset) + seg.dataLength >= Number(seg.filesize)) {
                            completed = true;
                            socket.end();
                            finish();
                            return;
                        }
                    }
                } catch (error) {
                    socket.end();
                    finish(error instanceof Error ? error : new Error(String(error)));
                }
            });
            // 未收到完成响应就断开，视为失败以回退 HTTP，避免“假成功”导致文件未落盘
            socket.on('close', () => finish(completed ? undefined : new DianaError(ErrorCode.Network, 'TCP 上传未完成')));
            socket.on('error', (error) => finish(error));
        });
    }

    private async uploadHttp(trans: HighwayTrans): Promise<void> {
        const blocks = splitBlocks(trans.data);
        let offset = 0;
        for (const [index, block] of blocks.entries()) {
            const frame = packFrame(buildHead(this.appId, trans, this.nextSequence(), offset, block.length, md5(block)), block);
            const response = await this.httpPost(frame, trans, index === blocks.length - 1);
            const [head] = unpackFrame(response);
            const parsed = RespDataHighwayHead.decode(head);
            if (parsed.errorCode !== 0) {
                throw new DianaError(ErrorCode.Network, `HTTP 上传失败 (code=${parsed.errorCode})`);
            }
            offset += block.length;
        }
    }

    private httpPost(frame: Buffer, trans: HighwayTrans, last: boolean): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const req = request(
                `http://${trans.host}:${trans.port}/cgi-bin/httpconn?htcmd=0x6FF0087&uin=${trans.uin}`,
                {
                    method: 'POST',
                    headers: {
                        Connection: last ? 'close' : 'keep-alive',
                        'Accept-Encoding': 'identity',
                        'User-Agent': 'Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.2)',
                        'Content-Length': frame.length.toString(),
                    },
                },
                (res) => {
                    const chunks: Buffer[] = [];
                    res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
                    res.on('end', () => resolve(Buffer.concat(chunks)));
                },
            );
            req.on('error', reject);
            req.write(frame);
            req.end();
        });
    }
}