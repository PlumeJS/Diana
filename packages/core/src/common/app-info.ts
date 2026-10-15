import { z } from 'zod';

/** 登录所需的 App 信息。 */
export interface AppInfo {
    /** 操作系统名称，如 `Windows`。 */
    Os: string;
    /** 系统内核名，如 `Windows_NT`。 */
    Kernel: string;
    /** 平台标识，如 `win32`。 */
    VendorOs: string;
    /** 客户端版本号，如 `9.9.35-52892`。 */
    CurrentVersion: string;
    /** MiscBitmap。 */
    MiscBitmap: number;
    /** 协议版本，如 `2.0.0`。 */
    PtVersion: string;
    /** SSO 版本。 */
    SsoVersion: number;
    /** 包名，如 `com.tencent.qq`。 */
    PackageName: string;
    /** WtLogin SDK 版本。 */
    WtLoginSdk: string;
    AppId: number;
    SubAppId: number;
    AppIdQrCode: number;
    AppClientVersion: number;
    /** 主签名映射位图。 */
    MainSigMap: number;
    /** 子签名映射位图。 */
    SubSigMap: number;
    /** QUA 字符串（安全签名使用）。 */
    Qua?: string;
}

/** Windows（PC QQ 9.9.x）协议预设。 */
export const WINDOWS_APP_INFO: AppInfo = {
    Os: 'Windows',
    Kernel: 'Windows_NT',
    VendorOs: 'win32',
    CurrentVersion: '9.9.35-52892',
    MiscBitmap: 32764,
    PtVersion: '2.0.0',
    SsoVersion: 19,
    PackageName: 'com.tencent.qq',
    WtLoginSdk: 'nt.wtlogin.0.0.1',
    AppId: 1600001604,
    SubAppId: 537382819,
    AppIdQrCode: 1600001604,
    AppClientVersion: 52892,
    MainSigMap: 169742560,
    SubSigMap: 0,
    Qua: 'V1_WIN_NQ_9.9.35_52892_GW_B',
};

/** Linux 协议预设。 */
export const LINUX_APP_INFO: AppInfo = {
    Os: 'Linux',
    VendorOs: 'linux',
    Kernel: 'Linux',
    CurrentVersion: '3.2.15-30366',
    MiscBitmap: 32764,
    PtVersion: '2.0.0',
    SsoVersion: 19,
    PackageName: 'com.tencent.qq',
    WtLoginSdk: 'nt.wtlogin.0.0.1',
    AppId: 1600001615,
    SubAppId: 537258424,
    AppIdQrCode: 13697054,
    AppClientVersion: 30366,
    MainSigMap: 169742560,
    SubSigMap: 0,
};

/** 协议平台预设表。 */
export const APP_INFO_PRESETS = {
    windows: WINDOWS_APP_INFO,
    linux: LINUX_APP_INFO,
} as const;

/** 协议平台。 */
export type ProtocolOs = keyof typeof APP_INFO_PRESETS;

/** 取对应平台的预设，`version` 非空时覆盖客户端版本。 */
export function appInfoFor(os: ProtocolOs, version?: string): AppInfo {
    const base = APP_INFO_PRESETS[os];
    if (!version) {
        return base;
    }
    const build = Number(version.split('-')[1]);
    return {
        ...base,
        CurrentVersion: version,
        AppClientVersion: Number.isInteger(build) ? build : base.AppClientVersion,
    };
}

const appInfoOverrideSchema = z.object({
    Os: z.string().optional(),
    Kernel: z.string().optional(),
    VendorOs: z.string().optional(),
    Qua: z.string().optional(),
    CurrentVersion: z.string().optional(),
    MiscBitmap: z.number().optional(),
    PtVersion: z.string().optional(),
    SsoVersion: z.number().optional(),
    PackageName: z.string().optional(),
    WtLoginSdk: z.string().optional(),
    AppId: z.number().optional(),
    SubAppId: z.number().optional(),
    AppIdQrCode: z.number().optional(),
    AppClientVersion: z.number().optional(),
    MainSigMap: z.number().optional(),
    SubSigMap: z.number().optional(),
});

/** 用外部数据覆盖预设，未提供的字段沿用预设。 */
export function overrideAppInfo(base: AppInfo, raw: unknown): AppInfo {
    const parsed = appInfoOverrideSchema.parse(raw);
    const defined = Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== undefined));
    return { ...base, ...defined };
}
