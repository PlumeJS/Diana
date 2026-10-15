import { readFileSync } from 'node:fs';
import type { LogLevel, ProtocolOs } from '@diana/core';
import type { OneBotConfig } from '@diana/onebot';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

/** 默认 SSO 登录服务器（host:port）。 */
export const DEFAULT_SERVER = 'msfwifi.3g.qq.com:8080';
/** 默认登录端口。 */
export const DEFAULT_PORT = 8080;

/**
 * 内置默认配置模板。
 * 首次运行（工作目录缺少 config.yaml，如单文件可执行程序）时写入磁盘。
 */
export const DEFAULT_CONFIG_YAML = `# Diana 运行配置
protocol:
  # 协议平台：windows / linux（对应 AppInfo 预设）
  os: linux
  # 客户端版本：留空用预设，填 custom 则读取工作目录的 app-info.json
  version: ''
  # SSO 登录服务器（host:port 或完整 URL）
  server: ${DEFAULT_SERVER}
  # 签名服务器地址（POST，留空则不签名）
  signServer: ''
  # 签名服务器 token（留空则不携带）
  signToken: ''
  # 二维码轮询间隔（毫秒）
  interval: 5000

onebot:
  # 正向 WebSocket：本端监听，客户端连接
  forwardWs:
    host: 0.0.0.0
    port: 3000
  # 反向 WebSocket：主动连接的对端地址
  reverseWs: []
  # HTTP API：本端监听
  http:
    host: 0.0.0.0
    port: 3001
  # HTTP POST：事件上报地址
  httpPost: []
  # 访问令牌（留空则不校验）
  accessToken: ''
  # 心跳间隔（毫秒），0 表示关闭
  heartbeatInterval: 30000

# 日志配置
log:
  # 全局日志等级：trace / debug / info / warn / error / fatal
  level: info

# 登录会话持久化路径
sessionFile: .diana/session.json
# 二维码图片保存路径
qrImageFile: .diana/qrcode.png
`;

const endpointSchema = z.object({
    host: z.string().optional(),
    port: z.number().int(),
});

const schema = z.object({
    protocol: z
        .object({
            os: z.enum(['windows', 'linux']).optional(),
            version: z.string().optional(),
            server: z.string().optional(),
            signServer: z.string().optional(),
            signToken: z.string().optional(),
            interval: z.number().int().optional(),
        })
        .optional(),
    onebot: z
        .object({
            forwardWs: endpointSchema.optional(),
            reverseWs: z.array(z.string()).optional(),
            http: endpointSchema.optional(),
            httpPost: z.array(z.string()).optional(),
            accessToken: z.string().optional(),
            heartbeatInterval: z.number().int().optional(),
        })
        .optional(),
    sessionFile: z.string().optional(),
    qrImageFile: z.string().optional(),
    log: z
        .object({
            level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).optional(),
        })
        .optional(),
});

/** 应用配置。 */
export interface AppConfig {
    protocol: {
        /** 协议平台，决定 AppInfo 预设。 */
        os: ProtocolOs;
        /** 客户端版本，留空使用预设。 */
        version: string;
        /** SSO 登录服务器地址。 */
        host: string;
        port: number;
        /** 签名服务器地址，留空则不签名。 */
        signServer: string;
        /** 签名服务器 token，留空则不携带。 */
        signToken: string;
        /** 二维码轮询间隔（毫秒）。 */
        interval: number;
    };
    onebot: OneBotConfig;
    /** 日志配置。 */
    log: {
        /** 全局日志等级，默认 info。 */
        level: LogLevel;
    };
    /** 登录会话持久化路径。 */
    sessionFile: string;
    /** 二维码图片保存路径。 */
    qrImageFile: string;
}

/** 解析 `host:port` 或完整 URL，端口缺省时使用默认端口。 */
function parseServer(server: string): { host: string; port: number } {
    const parsed = new URL(server.includes('://') ? server : `tcp://${server}`);
    const port = Number(parsed.port);
    return { host: parsed.hostname, port: Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT };
}

/** 校验并补全默认值。 */
export function parseConfig(raw: unknown): AppConfig {
    const parsed = schema.parse(raw);
    return {
        protocol: {
            os: parsed.protocol?.os ?? 'windows',
            version: parsed.protocol?.version ?? '',
            ...parseServer(parsed.protocol?.server || DEFAULT_SERVER),
            signServer: parsed.protocol?.signServer ?? '',
            signToken: parsed.protocol?.signToken ?? '',
            interval: parsed.protocol?.interval ?? 5000,
        },
        onebot: parsed.onebot ?? {},
        log: { level: parsed.log?.level ?? 'info' },
        sessionFile: parsed.sessionFile ?? '.diana/session.json',
        qrImageFile: parsed.qrImageFile ?? '.diana/qrcode.png',
    };
}

/** 读取并解析 YAML 配置文件。 */
export function loadConfig(path: string): AppConfig {
    return parseConfig(parseYaml(readFileSync(path, 'utf8')));
}
