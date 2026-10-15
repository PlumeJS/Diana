import { DianaError, ErrorCode } from '../common/errors.js';

/** TEA 各轮使用的增量常量。 */
const DELTAS = [
    0x9e3779b9, 0x3c6ef372, 0xdaa66d2b, 0x78dde6e4, 0x1715609d, 0xb54cda56, 0x5384540f, 0xf1bbcdc8, 0x8ff34781,
    0x2e2ac13a, 0xcc623af3, 0x6a99b4ac, 0x08d12e65, 0xa708a81e, 0x454021d7, 0xe3779b90,
] as const;

/** 解密结果的尾部校验块。 */
const CHECK_BLOCK = Buffer.alloc(7);

type TeaKey = readonly [number, number, number, number];

/** 从 16 字节密钥解析出 4 个 32 位子密钥。 */
function readKey(key: Buffer): TeaKey {
    return [key.readUInt32BE(0), key.readUInt32BE(4), key.readUInt32BE(8), key.readUInt32BE(12)];
}

/** 单块加密。 */
function encryptBlock(x: number, y: number, key: TeaKey): [number, number] {
    const [k0, k1, k2, k3] = key;
    for (let i = 0; i < 16; i++) {
        const delta = DELTAS[i]!;
        const sum = (y + delta) >>> 0;
        const a = ((((y << 4) >>> 0) + k0) ^ sum ^ (((y >>> 5) + k1) >>> 0)) >>> 0;
        x = (x + a) >>> 0;
        const b = ((((x << 4) >>> 0) + k2) ^ ((x + delta) >>> 0) ^ (((x >>> 5) + k3) >>> 0)) >>> 0;
        y = (y + b) >>> 0;
    }
    return [x, y];
}

/** 单块解密。 */
function decryptBlock(x: number, y: number, key: TeaKey): [number, number] {
    const [k0, k1, k2, k3] = key;
    for (let i = 15; i >= 0; i--) {
        const delta = DELTAS[i]!;
        const a = ((((x << 4) >>> 0) + k2) ^ ((x + delta) >>> 0) ^ (((x >>> 5) + k3) >>> 0)) >>> 0;
        y = (y - a) >>> 0;
        const b = ((((y << 4) >>> 0) + k0) ^ ((y + delta) >>> 0) ^ (((y >>> 5) + k1) >>> 0)) >>> 0;
        x = (x - b) >>> 0;
    }
    return [x, y];
}

/**
 * 使用 TEA 加密数据。
 * @param data 明文
 * @param key 16 字节密钥
 */
export function encryptTea(data: Buffer, key: Buffer): Buffer {
    const pad = (((6 - data.length) >>> 0) % 8) + 2;
    const buffer = Buffer.concat([Buffer.from([(pad - 2) | 0xf8]), Buffer.allocUnsafe(pad), data, CHECK_BLOCK]);
    const teaKey = readKey(key);
    let r1 = 0;
    let r2 = 0;
    let t1 = 0;
    let t2 = 0;
    for (let i = 0; i < buffer.length; i += 8) {
        const a1 = buffer.readUInt32BE(i);
        const a2 = buffer.readUInt32BE(i + 4);
        const b1 = (a1 ^ r1) >>> 0;
        const b2 = (a2 ^ r2) >>> 0;
        const [x, y] = encryptBlock(b1, b2, teaKey);
        r1 = (x ^ t1) >>> 0;
        r2 = (y ^ t2) >>> 0;
        t1 = b1;
        t2 = b2;
        buffer.writeUInt32BE(r1, i);
        buffer.writeUInt32BE(r2, i + 4);
    }
    return buffer;
}

/**
 * 使用 TEA 解密数据。
 * @param data 密文（长度需为 8 的倍数）
 * @param key 16 字节密钥
 */
export function decryptTea(data: Buffer, key: Buffer): Buffer {
    if (data.length % 8 !== 0) {
        throw new DianaError(ErrorCode.Protocol, 'TEA 密文长度必须是 8 的倍数');
    }
    const buffer = Buffer.from(data);
    const teaKey = readKey(key);
    let t1 = 0;
    let t2 = 0;
    let x = 0;
    let y = 0;
    for (let i = 0; i < buffer.length; i += 8) {
        const a1 = buffer.readUInt32BE(i);
        const a2 = buffer.readUInt32BE(i + 4);
        const b1 = (a1 ^ x) >>> 0;
        const b2 = (a2 ^ y) >>> 0;
        const [rx, ry] = decryptBlock(b1, b2, teaKey);
        x = rx;
        y = ry;
        const r1 = (x ^ t1) >>> 0;
        const r2 = (y ^ t2) >>> 0;
        t1 = a1;
        t2 = a2;
        buffer.writeUInt32BE(r1, i);
        buffer.writeUInt32BE(r2, i + 4);
    }
    if (!buffer.subarray(buffer.length - 7).equals(CHECK_BLOCK)) {
        throw new DianaError(ErrorCode.Protocol, 'TEA 密文校验失败');
    }
    return buffer.subarray((buffer.readUInt8(0) & 0x07) + 3, buffer.length - 7);
}
