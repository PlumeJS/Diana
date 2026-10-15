import type { AppInfo } from '../common/app-info.js';
import { DianaError, ErrorCode } from '../common/errors.js';
import { z } from 'zod';

/** 签名结果，写入 SSO 包头的 secureInfo。 */
export interface SignResult {
    sign: Buffer;
    token: Buffer;
    extra: Buffer;
}

/** 签名提供者：为指定命令与内容生成签名。 */
export interface SignProvider {
    sign(cmd: string, src: Buffer, seq: number): Promise<SignResult>;
    /** 通过签名服务的 `/appinfo` 接口获取远端 AppInfo，未提供该接口时返回 `null`。 */
    getAppInfo?(): Promise<Partial<AppInfo> | null>;
}

/** 需要携带签名的命令字。 */
export const SIGN_COMMANDS = new Set<string>([
    'trpc.o3.ecdh_access.EcdhAccess.SsoEstablishShareKey',
    'trpc.o3.ecdh_access.EcdhAccess.SsoSecureAccess',
    'trpc.o3.report.Report.SsoReport',
    'MessageSvc.PbSendMsg',
    'wtlogin.trans_emp',
    'wtlogin.login',
    'trpc.login.ecdh.EcdhService.SsoKeyExchange',
    'trpc.login.ecdh.EcdhService.SsoNTLoginPasswordLogin',
    'trpc.login.ecdh.EcdhService.SsoNTLoginEasyLogin',
    'trpc.login.ecdh.EcdhService.SsoNTLoginPasswordLoginNewDevice',
    'trpc.login.ecdh.EcdhService.SsoNTLoginEasyLoginUnusualDevice',
    'trpc.login.ecdh.EcdhService.SsoNTLoginPasswordLoginUnusualDevice',
    'OidbSvcTrpcTcp.0x11ec_1',
    'OidbSvcTrpcTcp.0x758_1',
    'OidbSvcTrpcTcp.0x7c1_1',
    'OidbSvcTrpcTcp.0x7c2_5',
    'OidbSvcTrpcTcp.0x10db_1',
    'OidbSvcTrpcTcp.0x8a1_7',
    'OidbSvcTrpcTcp.0x89a_0',
    'OidbSvcTrpcTcp.0x89a_15',
    'OidbSvcTrpcTcp.0x88d_0',
    'OidbSvcTrpcTcp.0x88d_14',
    'OidbSvcTrpcTcp.0x112a_1',
    'OidbSvcTrpcTcp.0x587_74',
    'OidbSvcTrpcTcp.0x1100_1',
    'OidbSvcTrpcTcp.0x1102_1',
    'OidbSvcTrpcTcp.0x1103_1',
    'OidbSvcTrpcTcp.0x1107_1',
    'OidbSvcTrpcTcp.0x1105_1',
    'OidbSvcTrpcTcp.0xf88_1',
    'OidbSvcTrpcTcp.0xf89_1',
    'OidbSvcTrpcTcp.0xf57_1',
    'OidbSvcTrpcTcp.0xf57_106',
    'OidbSvcTrpcTcp.0xf57_9',
    'OidbSvcTrpcTcp.0xf55_1',
    'OidbSvcTrpcTcp.0xf67_1',
    'OidbSvcTrpcTcp.0xf67_5',
    'OidbSvcTrpcTcp.0x6d9_4',
]);

const signResponseSchema = z.object({
    value: z.object({
        sign: z.string(),
        token: z.string(),
        extra: z.string(),
    }),
});

/** 在签名服务基础地址后追加 `appinfo` 路径段，语义对齐 acidify 的 `appendPathSegments`。 */
function appInfoUrl(base: string): string {
    return `${base.replace(/\/+$/, '')}/appinfo`;
}

/** 基于 HTTP 签名服务器的提供者。 */
export function createUrlSignProvider(url: string, token?: string): SignProvider {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return {
        async sign(cmd, src, seq) {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...headers,
                },
                body: JSON.stringify({ cmd, src: src.toString('hex'), seq }),
            });
            if (!response.ok) {
                throw new DianaError(ErrorCode.Network, `签名服务器返回 ${response.status}`);
            }
            const value = signResponseSchema.parse(await response.json()).value;
            return {
                sign: Buffer.from(value.sign, 'hex'),
                token: Buffer.from(value.token, 'hex'),
                extra: Buffer.from(value.extra, 'hex'),
            };
        },
        async getAppInfo(): Promise<Partial<AppInfo> | null> {
            const response = await fetch(appInfoUrl(url), { headers });
            if (!response.ok) {
                return null;
            }
            return (await response.json()) as Partial<AppInfo>;
        },
    };
}
