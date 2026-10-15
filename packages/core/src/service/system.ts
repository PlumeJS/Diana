import type { AppInfo } from '../common/app-info.js';
import type { DeviceInfo } from '../common/device-info.js';
import { DianaError, ErrorCode } from '../common/errors.js';
import { createLogger } from '../common/logger.js';
import type { Logger } from '../common/logger.js';
import { fetchFaceDetailsContract, fetchFaceDetailsResponseContract } from '../packet/oidb/index.js';
import type { FaceInfo } from '../packet/oidb/index.js';
import {
    InfoSyncPush,
    KickNTReq,
    SsoHeartBeat,
    SsoHeartBeatResponse,
    SsoInfoSync,
    SsoInfoSyncResponse,
    UnRegisterInfo,
} from '../packet/system.js';
import { randomInt } from '../util/random.js';
import type { HighwayService } from './highway.js';
import type { OidbService } from './oidb.js';
import type { PushPacket, SsoTransport } from './transport.js';

/** 上线同步命令字。 */
const REGISTER_COMMAND = 'trpc.msg.register_proxy.RegisterProxy.SsoInfoSync';
/** 心跳命令字。 */
const HEARTBEAT_COMMAND = 'trpc.qq_new_tech.status_svc.StatusService.SsoHeartBeat';
/** 下线命令字。 */
const UNREGISTER_COMMAND = 'trpc.qq_new_tech.status_svc.StatusService.UnRegister';
/** 被踢下线推送命令字。 */
const KICK_COMMAND = 'trpc.qq_new_tech.status_svc.StatusService.KickNT';
/** 信息同步推送命令字。 */
const INFO_SYNC_PUSH_COMMAND = 'trpc.msg.register_proxy.RegisterProxy.InfoSyncPush';
/** Alive 保活命令字。 */
const ALIVE_COMMAND = 'Heartbeat.Alive';
/** Alive 保活间隔（毫秒）。 */
const ALIVE_INTERVAL = 2000;
/** Alive 保活固定载荷。 */
const ALIVE_BODY = Buffer.from([0x00, 0x00, 0x00, 0x04]);
/** 默认心跳间隔（毫秒）。 */
const DEFAULT_HEARTBEAT_INTERVAL = 4.5 * 60 * 1000;
/** 认可的心跳间隔范围（毫秒）。 */
const MIN_HEARTBEAT_INTERVAL = 30 * 1000;
const MAX_HEARTBEAT_INTERVAL = 10 * 60 * 1000;

/** 被踢下线信息。 */
export interface KickInfo {
    title: string;
    tip: string;
}

/** 被踢下线处理器。 */
export type KickHandler = (info: KickInfo) => void;

/** 系统服务所需的上下文。 */
export interface SystemContext {
    appInfo: AppInfo;
    deviceInfo: DeviceInfo;
    transport: SsoTransport;
    oidb: OidbService;
    highway: HighwayService;
}

/** 上线、心跳、下线与系统推送。 */
export class SystemService {
    private readonly logger: Logger;
    private readonly faces = new Map<string, FaceInfo>();
    private readonly kickHandlers = new Set<KickHandler>();
    private readonly pushHandler: (packet: PushPacket) => void;
    private heartbeatTimer?: NodeJS.Timeout;
    private aliveTimer?: NodeJS.Timeout;
    private heartbeatInterval = DEFAULT_HEARTBEAT_INTERVAL;

    constructor(private readonly ctx: SystemContext) {
        this.logger = createLogger('SystemService');
        this.pushHandler = (packet) => this.handlePush(packet);
        this.ctx.transport.onPush(this.pushHandler);
    }

    /** 已加载的表情信息，按 `qSid` 索引。 */
    get faceDetails(): ReadonlyMap<string, FaceInfo> {
        return this.faces;
    }

    /** 注册被踢下线处理器。 */
    onKick(handler: KickHandler): void {
        this.kickHandlers.add(handler);
    }

    /** 移除被踢下线处理器。 */
    offKick(handler: KickHandler): void {
        this.kickHandlers.delete(handler);
    }

    /** 发送上线包，成功后启动心跳并完成上线初始化。 */
    async online(): Promise<void> {
        const message = await this.register();
        if (!message.includes('register success')) {
            throw new DianaError(ErrorCode.Login, `上线失败：${message || '服务器未返回注册结果'}`);
        }
        this.logger.info('发送上线包成功');
        this.scheduleHeartbeat();
        this.startAlive();
        try {
            await this.fetchFaces();
        } catch (error) {
            this.logger.warn('拉取表情信息失败', error);
        }
        try {
            await this.fetchHighway();
        } catch (error) {
            this.logger.warn('拉取高速上传服务器失败', error);
        }
        this.logger.info(`用户 ${this.ctx.transport.session.uin} 已上线`);
    }

    /** 停止心跳并上报下线。 */
    async offline(): Promise<void> {
        this.stopHeartbeat();
        this.stopAlive();
        await this.ctx.transport.send(UNREGISTER_COMMAND, UnRegisterInfo.encode({ device: this.device() }));
    }

    /** 释放推送监听与心跳。 */
    dispose(): void {
        this.stopHeartbeat();
        this.stopAlive();
        this.ctx.transport.offPush(this.pushHandler);
        this.kickHandlers.clear();
    }

    /** 发送一次心跳，并按其返回的间隔安排下一次。 */
    async heartbeat(): Promise<void> {
        try {
            const response = await this.ctx.transport.send(HEARTBEAT_COMMAND, SsoHeartBeat.encode({ type: 1 }));
            if ('body' in response) {
                this.applyHeartbeatInterval(SsoHeartBeatResponse.decode(response.body).interval);
            }
        } catch (error) {
            this.logger.warn('心跳发送失败', error);
        }
    }

    /** 拉取表情信息。 */
    async fetchFaces(): Promise<number> {
        const response = await this.ctx.oidb.call(fetchFaceDetailsContract, fetchFaceDetailsResponseContract, {
            field1: 0,
            field2: 7,
            field3: '0',
        });
        const details = [response.commonFace, response.specialBigFace, response.specialMagicFace].flatMap(
            (face) => face?.facePackList.flatMap((pack) => pack.faces) ?? [],
        );
        for (const detail of details) {
            this.faces.set(detail.qSid, detail);
        }
        this.logger.info(`加载了 ${details.length} 条表情信息`);
        return details.length;
    }

    /** 拉取并配置高速上传服务器。 */
    async fetchHighway(): Promise<void> {
        const servers = await this.ctx.highway.fetchServer();
        const first = servers[0];
        if (first) {
            this.logger.info(`已配置 Highway 服务器: ${first.ip}:${first.port}`);
        }
    }

    /** 处理系统级推送。 */
    private handlePush(packet: PushPacket): void {
        if (packet.command === KICK_COMMAND) {
            const kick = KickNTReq.decode(packet.body);
            this.stopHeartbeat();
            this.stopAlive();
            this.logger.warn(`已被踢下线：${kick.tipsTitle} ${kick.tipsInfo}`);
            for (const handler of this.kickHandlers) {
                handler({ title: kick.tipsTitle, tip: kick.tipsInfo });
            }
            return;
        }
        if (packet.command === INFO_SYNC_PUSH_COMMAND) {
            this.handleInfoSyncPush(packet.body);
            return;
        }
        this.logger.debug(`收到未处理的推送 (cmd=${packet.command})`);
    }

    /** 处理信息同步推送（官方实现仅解析并丢弃，此处记录日志）。 */
    private handleInfoSyncPush(body: Buffer): void {
        try {
            const push = InfoSyncPush.decode(body);
            this.logger.debug(`收到信息同步推送 (result=${push.result ?? 0}, pushSeq=${push.pushSeq ?? 0})`);
        } catch (error) {
            this.logger.warn('解析信息同步推送失败', error);
        }
    }

    /** 启动 Alive 保活（固定载荷、明文、不等待响应）。 */
    private startAlive(): void {
        this.stopAlive();
        this.aliveTimer = setInterval(() => {
            if (!this.ctx.transport.isConnected) {
                return;
            }
            this.ctx.transport.sendSimple(ALIVE_COMMAND, ALIVE_BODY);
            this.logger.debug('发送 Alive 保活包');
        }, ALIVE_INTERVAL);
    }

    private stopAlive(): void {
        if (this.aliveTimer) {
            clearInterval(this.aliveTimer);
            this.aliveTimer = undefined;
        }
    }

    private scheduleHeartbeat(): void {
        this.stopHeartbeat();
        this.heartbeatTimer = setTimeout(() => {
            void this.heartbeat().finally(() => {
                if (this.heartbeatTimer) {
                    this.scheduleHeartbeat();
                }
            });
        }, this.heartbeatInterval);
    }

    private stopHeartbeat(): void {
        if (this.heartbeatTimer) {
            clearTimeout(this.heartbeatTimer);
            this.heartbeatTimer = undefined;
        }
    }

    /** 应用服务器返回的心跳间隔；协议未标注单位，按秒或毫秒识别，越界则沿用原值。 */
    private applyHeartbeatInterval(interval: number): void {
        const milliseconds = interval >= MIN_HEARTBEAT_INTERVAL ? interval : interval * 1000;
        if (milliseconds >= MIN_HEARTBEAT_INTERVAL && milliseconds <= MAX_HEARTBEAT_INTERVAL) {
            this.heartbeatInterval = milliseconds;
        }
    }

    private async register(): Promise<string> {
        const { appInfo, deviceInfo } = this.ctx;
        const response = await this.ctx.transport.send(
            REGISTER_COMMAND,
            SsoInfoSync.encode({
                syncFlag: 735,
                reqRandom: randomInt(0, 0xffffffff),
                curActiveStatus: 2,
                groupLastMsgTime: 0n,
                c2cInfoSync: {
                    c2cMsgCookie: { c2cLastMsgTime: 0n },
                    c2cLastMsgTime: 0n,
                    lastC2cMsgCookie: { c2cLastMsgTime: 0n },
                },
                registerInfo: {
                    guid: deviceInfo.guid.toString('hex'),
                    kickPC: 0,
                    currentVersion: appInfo.CurrentVersion,
                    isFirstRegisterProxyOnline: 1,
                    localeId: 2052,
                    device: this.device(),
                    setMute: 0,
                    registerVendorType: 6,
                    regType: 0,
                    businessInfo: { notifySwitch: 1, bindUinNotifySwitch: 1 },
                    batteryStatus: 0,
                    field12: 1,
                },
                unknownStructure: { groupCode: 0, flag2: 2 },
                appState: { isDelayRequest: 0, appStatus: 0, silenceStatus: 0 },
            }),
        );
        if (!('body' in response)) {
            throw new DianaError(ErrorCode.Login, `上线请求失败 (retcode=${response.retcode}): ${response.extra}`);
        }
        return SsoInfoSyncResponse.decode(response.body).registerInfoResponse?.message ?? '';
    }

    private device() {
        const { appInfo, deviceInfo } = this.ctx;
        return {
            user: deviceInfo.deviceName,
            os: appInfo.Kernel,
            osVer: deviceInfo.systemKernel,
            vendorName: '',
            osLower: appInfo.VendorOs,
        };
    }
}
