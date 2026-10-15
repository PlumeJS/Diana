import { HEX_TEMPLATE, randomString } from './random.js';

/** 当前 UNIX 时间戳（秒）。 */
export function timestamp(): number {
    return Math.floor(Date.now() / 1000);
}

/** 生成随机的 traceParent。 */
export function generateTrace(): string {
    return `00-${randomString(32, HEX_TEMPLATE)}-${randomString(16, HEX_TEMPLATE)}-01`;
}

/** 将 32 位整型 IP 转换为点分十进制字符串。 */
export function int32IpToString(ip: number): string {
    const value = ip >>> 0;
    return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff].join('.');
}
