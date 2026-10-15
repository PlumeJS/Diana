import { randomInt as cryptoRandomInt } from 'node:crypto';

/** 生成 `[min, max]` 区间内的随机整数。 */
export function randomInt(min: number, max: number): number {
    return cryptoRandomInt(min, max + 1);
}

/** 从模板字符集中生成指定长度的随机字符串。 */
export function randomString(length: number, template: string): string {
    if (template.length === 0) {
        throw new Error('template must not be empty');
    }
    let result = '';
    for (let i = 0; i < length; i++) {
        result += template.charAt(cryptoRandomInt(0, template.length));
    }
    return result;
}

/** 十六进制字符集。 */
export const HEX_TEMPLATE = '0123456789abcdef';
