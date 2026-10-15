import { createECDH, randomBytes } from 'node:crypto';
import type { ECDH } from 'node:crypto';
import { md5 } from './digest.js';

/** NTQQ 服务端在 prime256v1 曲线上的公钥。 */
const SERVER_KEY_256 = Buffer.from(
    '049D1423332735980EDABE7E9EA451B3395B6F35250DB8FC56F25889F628CBAE3E8E73077914071EEEBC108F4E0170057792BB17AA303AF652313D17C1AC815E79',
    'hex',
);

/** NTQQ 服务端在 secp192k1 曲线上的公钥。 */
const SERVER_KEY_192 = Buffer.from(
    '04928D8850673088B343264E0C6BACB8496D697799F37211DEB25BB73906CB089FEA9639B4E0260498B51A992D50813DA8',
    'hex',
);

/**
 * 内部密钥协商接口，用于屏蔽底层曲线实现差异。
 *
 * Bun 内置的 BoringSSL 仅支持 prime256v1 / secp384r1 / secp521r1 / secp224r1 等少数曲线，
 * 对 NTQQ 所需的 secp192k1 会抛出 `ERR_CRYPTO_OPERATION_FAILED`，故对该曲线改用纯 JS 实现。
 */
interface KeyAgreement {
    /** 生成本地密钥对，返回未压缩公钥（`0x04` 前缀 + X + Y）。 */
    generateKeys(): Buffer;
    /** 使用本地私钥与对端公钥协商共享密钥，返回曲线上的 X 坐标。 */
    computeSecret(publicKey: Buffer): Buffer;
}

// region secp192k1 纯 JS 实现

/** secp192k1 曲线参数（SEC 2）。 */
const P192 = 0xfffffffffffffffffffffffffffffffffffffffeffffee37n;
const A192 = 0n;
const B192 = 3n;
const GX192 = 0xdb4ff10ec057e9ae26b07d0280b7f4341da5d1b1eae06c7dn;
const GY192 = 0x9b2f2f6d9c5628a7844163d015be86344082aa88d95e2f9dn;
const N192 = 0xfffffffffffffffffffffffe26f2fc170f69466a74defd8dn;
/** 坐标字节长度。 */
const SIZE192 = 24;

/** 曲线上的仿射坐标点，`null` 表示无穷远点。 */
type Point192 = { x: bigint; y: bigint };

function mod192(value: bigint): bigint {
    const result = value % P192;
    return result >= 0n ? result : result + P192;
}

/** 模逆元，基于扩展欧几里得算法。 */
function inv192(value: bigint): bigint {
    let [oldR, r] = [mod192(value), P192];
    let [oldS, s] = [1n, 0n];
    while (r !== 0n) {
        const quotient = oldR / r;
        [oldR, r] = [r, oldR - quotient * r];
        [oldS, s] = [s, oldS - quotient * s];
    }
    return mod192(oldS);
}

/** 模幂运算。 */
function pow192(base: bigint, exponent: bigint): bigint {
    let result = 1n;
    let factor = mod192(base);
    let power = exponent;
    while (power > 0n) {
        if (power & 1n) result = (result * factor) % P192;
        factor = (factor * factor) % P192;
        power >>= 1n;
    }
    return result;
}

/** 仿射坐标下的点加法，包含倍点情形。 */
function addPoint192(a: Point192 | null, b: Point192 | null): Point192 | null {
    if (a === null) return b;
    if (b === null) return a;
    let slope: bigint;
    if (a.x === b.x) {
        if (mod192(a.y + b.y) === 0n) return null;
        slope = (mod192(3n * a.x * a.x + A192) * inv192(mod192(2n * a.y))) % P192;
    } else {
        slope = (mod192(b.y - a.y) * inv192(mod192(b.x - a.x))) % P192;
    }
    const x = mod192(slope * slope - a.x - b.x);
    const y = mod192(slope * (a.x - x) - a.y);
    return { x, y };
}

/** 标量乘法（二进制双倍-累加）。 */
function mulPoint192(scalar: bigint, point: Point192): Point192 | null {
    let result: Point192 | null = null;
    let addend: Point192 | null = point;
    let remaining = scalar;
    while (remaining > 0n) {
        if (remaining & 1n) result = addPoint192(result, addend);
        addend = addPoint192(addend, addend);
        remaining >>= 1n;
    }
    return result;
}

function bufferToBigInt(buffer: Buffer): bigint {
    return buffer.length === 0 ? 0n : BigInt(`0x${buffer.toString('hex')}`);
}

function bigIntToBuffer(value: bigint): Buffer {
    return Buffer.from(value.toString(16).padStart(SIZE192 * 2, '0'), 'hex');
}

/** 解析对端公钥，支持 `0x04` 未压缩与 `0x02`/`0x03` 压缩两种格式。 */
function unpackPoint192(publicKey: Buffer): Point192 {
    const prefix = publicKey[0];
    if (publicKey.length === SIZE192 * 2 + 1 && prefix === 0x04) {
        return {
            x: bufferToBigInt(publicKey.subarray(1, 1 + SIZE192)),
            y: bufferToBigInt(publicKey.subarray(1 + SIZE192)),
        };
    }
    if (publicKey.length === SIZE192 + 1 && (prefix === 0x02 || prefix === 0x03)) {
        const x = bufferToBigInt(publicKey.subarray(1));
        // p ≡ 3 (mod 4)，故平方根为 right^((p + 1) / 4)。
        let y = pow192(mod192(x * x * x + A192 * x + B192), (P192 + 1n) / 4n);
        if ((y & 1n) !== BigInt(prefix & 1)) y = P192 - y;
        return { x, y };
    }
    throw new Error('Length does not match');
}

/** secp192k1 的纯 JS 密钥协商实现。 */
class Secp192k1KeyAgreement implements KeyAgreement {
    private privateKey = 0n;

    generateKeys(): Buffer {
        let privateKey = 0n;
        do {
            privateKey = bufferToBigInt(randomBytes(SIZE192));
        } while (privateKey === 0n || privateKey >= N192);
        this.privateKey = privateKey;

        const publicPoint = mulPoint192(privateKey, { x: GX192, y: GY192 })!;
        return Buffer.concat([
            Buffer.from([0x04]),
            bigIntToBuffer(publicPoint.x),
            bigIntToBuffer(publicPoint.y),
        ]);
    }

    computeSecret(publicKey: Buffer): Buffer {
        const peer = unpackPoint192(publicKey);
        const shared = mulPoint192(this.privateKey, peer);
        if (shared === null) throw new Error('Invalid public key');
        return bigIntToBuffer(shared.x);
    }
}

// endregion

/** prime256v1 直接使用 Node/Bun 内置实现（两者均支持该曲线）。 */
function createNativeKeyAgreement(curve: string): KeyAgreement {
    const impl: ECDH = createECDH(curve);
    return {
        generateKeys: () => impl.generateKeys(),
        computeSecret: (publicKey) => impl.computeSecret(publicKey),
    };
}

/** 椭圆曲线密钥交换。 */
export class Ecdh {
    /** 本地公钥，压缩模式下为 25 字节的压缩形式。 */
    publicKey: Buffer;
    /** 与 NTQQ 服务端协商出的共享密钥。 */
    shareKey: Buffer;

    private readonly impl: KeyAgreement;
    private readonly compressed: boolean;

    constructor(curve: 'prime256v1' | 'secp192k1', compressed: boolean) {
        this.impl = curve === 'secp192k1' ? new Secp192k1KeyAgreement() : createNativeKeyAgreement('prime256v1');
        this.compressed = compressed;
        const serverKey = curve === 'secp192k1' ? SERVER_KEY_192 : SERVER_KEY_256;
        this.publicKey = this.impl.generateKeys();
        this.shareKey = this.impl.computeSecret(serverKey);
        if (compressed) {
            this.publicKey = Buffer.concat([Buffer.from('02', 'hex'), this.publicKey.subarray(1, 25)]);
            this.shareKey = md5(this.shareKey).subarray(0, 16);
        }
    }

    /** 与对端公钥协商共享密钥。 */
    exchange(publicKey: Buffer): Buffer {
        this.shareKey = this.impl.computeSecret(publicKey);
        if (this.compressed) {
            this.shareKey = md5(this.shareKey).subarray(0, 16);
        }
        return this.shareKey;
    }
}
