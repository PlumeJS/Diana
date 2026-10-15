import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import qrcode from 'qrcode-terminal';
import {
    appInfoFor,
    createLogger,
    createUrlSignProvider,
    DianaError,
    Ecdh,
    ErrorCode,
    FriendService,
    GroupFileService,
    GroupService,
    HighwayService,
    Keystore,
    LoginService,
    MediaService,
    MessageService,
    newDeviceInfo,
    NotifyService,
    NtLoginService,
    OidbService,
    overrideAppInfo,
    PrivateFileService,
    setLogLevel,
    SsoTransport,
    SystemService,
    UserService,
} from '@diana/core';
import type { AppInfo, DeviceInfo, LoginContext, Logger, SignProvider } from '@diana/core';
import { OneBotServer } from '@diana/onebot';
import type { OneBotContext } from '@diana/onebot';
import type { AppConfig } from './config.js';
import type { PersistedSession } from './session.js';
import { loadSession, saveSession } from './session.js';

/** 断线重连间隔（毫秒）。 */
const RECONNECT_DELAY = 5000;

/** 运行中的应用实例。 */
export interface DianaApp {
    /** 当前账号 uin。 */
    selfId: number;
    /** 停止服务并释放连接。 */
    stop(): Promise<void>;
}

function buildSession(appInfo: AppInfo, guid: string, persisted: PersistedSession | undefined) {
    return {
        uin: persisted ? String(persisted.uin) : '0',
        uid: persisted?.uid,
        a2: persisted ? Buffer.from(persisted.a2, 'base64') : Buffer.alloc(0),
        d2: persisted ? Buffer.from(persisted.d2, 'base64') : Buffer.alloc(0),
        d2Key: persisted ? Buffer.from(persisted.d2Key, 'base64') : Buffer.alloc(16),
        subAppId: appInfo.SubAppId,
        guid,
        version: appInfo.CurrentVersion,
    };
}

/** 汇总当前会话凭据，供持久化。 */
function currentSession(keystore: Keystore, guid: string, transport: SsoTransport): PersistedSession {
    const session = transport.session;
    return {
        uin: keystore.uin,
        uid: keystore.session.uid,
        guid,
        a2: session.a2.toString('base64'),
        d2: session.d2.toString('base64'),
        d2Key: session.d2Key.toString('base64'),
        a1: keystore.session.a1?.toString('base64'),
    };
}

/** 输出二维码并等待扫码、提交登录。 */
async function loginWithQrCode(loginContext: LoginContext, config: AppConfig, log: Logger): Promise<void> {
    const login = new LoginService(loginContext);
    log.info('正在获取登录二维码...');
    const qr = await login.fetchQrCode();
    mkdirSync(dirname(config.qrImageFile), { recursive: true });
    writeFileSync(config.qrImageFile, qr.qrCode);
    log.info(`二维码文件已保存至 ${config.qrImageFile}`);
    log.info('请使用手机 QQ 扫码登录：');
    process.stdout.write(`${qr.url}\n`);
    qrcode.generate(qr.url, { small: true }, (code) => process.stdout.write(`${code}\n`));

    await login.waitForQrConfirm(config.protocol.interval);
    loginContext.keystore.uin = await login.resolveUin();
    const result = await login.login();
    if (!result.success) {
        throw new DianaError(ErrorCode.Login, `登录失败 (state=${result.state}, tag=${result.tag}, message=${result.message})`);
    }
}

/**
 * 解析落地使用的 AppInfo。
 * 优先取签名服务的 `/appinfo` 接口；未取到时按 `custom` 读取工作目录的 app-info.json，否则用本地预设。
 */
async function resolveAppInfo(
    protocol: AppConfig['protocol'],
    signProvider: SignProvider | undefined,
    log: Logger,
): Promise<AppInfo> {
    const base = appInfoFor(protocol.os, protocol.version === 'custom' ? undefined : protocol.version || undefined);

    if (signProvider?.getAppInfo) {
        try {
            const remote = await signProvider.getAppInfo();
            if (remote) {
                log.info('已从签名服务获取 AppInfo');
                return overrideAppInfo(base, remote);
            }
        } catch (error) {
            log.warn('从签名服务获取 AppInfo 失败，回退本地配置', error);
        }
    }

    if (protocol.version !== 'custom') {
        return base;
    }
    let raw: string;
    try {
        raw = readFileSync('app-info.json', 'utf8');
    } catch {
        throw new DianaError(ErrorCode.Validation, 'version 为 custom 时需要在工作目录提供 app-info.json');
    }
    return overrideAppInfo(base, JSON.parse(raw));
}

/** 启动 Diana：连接服务器 → 登录（复用或扫码）→ 组装服务 → 启动 OneBot。 */
export async function start(config: AppConfig): Promise<DianaApp> {
    setLogLevel(config.log.level);
    const log = createLogger('App');
    const signProvider = config.protocol.signServer
        ? createUrlSignProvider(config.protocol.signServer, config.protocol.signToken || undefined)
        : undefined;
    const appInfo = await resolveAppInfo(config.protocol, signProvider, log);
    const persisted = loadSession(config.sessionFile);
    const deviceInfo: DeviceInfo = persisted
        ? { ...newDeviceInfo(), guid: Buffer.from(persisted.guid, 'hex') }
        : newDeviceInfo();

    const transport = new SsoTransport({
        host: config.protocol.host,
        port: config.protocol.port,
        session: buildSession(appInfo, deviceInfo.guid.toString('hex'), persisted),
        signProvider,
    });
    await transport.connect();

    const keystore = new Keystore();
    /** 扫码登录并落盘会话。 */
    const qrLogin = async (): Promise<void> => {
        const loginContext: LoginContext = {
            appInfo,
            deviceInfo,
            transport,
            keystore,
            ecdh192: new Ecdh('secp192k1', true),
        };
        await loginWithQrCode(loginContext, config, log);
        saveSession(config.sessionFile, currentSession(keystore, deviceInfo.guid.toString('hex'), transport));
        log.info(`登录成功：${keystore.uin}`);
    };

    if (persisted) {
        keystore.uin = persisted.uin;
        keystore.session.uid = persisted.uid;
        keystore.session.a1 = persisted.a1 ? Buffer.from(persisted.a1, 'base64') : undefined;
        log.info(`复用已保存的会话：${persisted.uin}`);
        if (keystore.session.a1) {
            try {
                await new NtLoginService({ appInfo, deviceInfo, transport, keystore }).refreshSession();
                saveSession(config.sessionFile, currentSession(keystore, deviceInfo.guid.toString('hex'), transport));
                log.info('会话已通过 a1 续期');
            } catch (error) {
                log.warn('会话续期失败，沿用已保存的会话', error);
            }
        }
    } else {
        await qrLogin();
    }

    const oidb = new OidbService(transport);
    const highway = new HighwayService(transport, appInfo.AppId);
    const system = new SystemService({ appInfo, deviceInfo, transport, oidb, highway });
    try {
        await system.online();
    } catch (error) {
        if (!persisted || !(error instanceof DianaError && error.code === ErrorCode.Login)) {
            throw error;
        }
        // 保存的会话已失效（如 retcode -10003），改用二维码重新登录
        log.warn(`复用会话已失效（${error.message}），回退二维码登录`);
        await qrLogin();
        await system.online();
    }

    let stopped = false;
    let reconnecting = false;
    let kicked = false;

    const reconnect = async (): Promise<void> => {
        while (!stopped && !transport.isConnected) {
            log.warn(`连接已断开，${RECONNECT_DELAY / 1000} 秒后重连...`);
            await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY));
            try {
                await transport.connect();
                await system.online();
                log.info('重连成功，事件推送已恢复');
                break;
            } catch (error) {
                log.warn('重连失败', error);
            }
        }
        reconnecting = false;
    };

    transport.onClose(() => {
        if (stopped || reconnecting || kicked) {
            return;
        }
        reconnecting = true;
        void reconnect();
    });

    system.onKick((info) => {
        // 被踢通常是其它端登录顶号，不再自动重连以免互踢
        kicked = true;
        log.error(`已被踢下线：${info.title} ${info.tip}`);
    });

    const ctx: OneBotContext = {
        selfId: keystore.uin,
        transport,
        message: new MessageService(transport, config.protocol.os),
        notify: new NotifyService(transport),
        friend: new FriendService(oidb),
        group: new GroupService(oidb),
        user: new UserService(oidb),
        media: new MediaService(oidb, highway, keystore.session.uid),
        groupFile: new GroupFileService(oidb, highway),
        privateFile: new PrivateFileService(oidb, highway, transport, keystore.uin),
        highway,
        system,
    };
    const server = new OneBotServer(ctx, config.onebot);
    await server.start();
    log.info(`OneBot 已启动（账号 ${keystore.uin}）`);

    return {
        selfId: keystore.uin,
        async stop(): Promise<void> {
            stopped = true;
            await server.stop();
            ctx.message.dispose();
            ctx.notify.dispose();
            if (transport.isConnected) {
                await system.offline();
            }
            system.dispose();
            transport.close();
        },
    };
}
