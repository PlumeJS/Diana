import { createHash } from 'node:crypto';

/** 可参与摘要计算的二进制数据。 */
export type BinaryData = string | Uint8Array;

/** 计算 MD5 摘要。 */
export function md5(data: BinaryData): Buffer {
    return createHash('md5').update(data).digest();
}

/** 计算 SHA1 摘要。 */
export function sha1(data: BinaryData): Buffer {
    return createHash('sha1').update(data).digest();
}

/** 计算 SHA256 摘要。 */
export function sha256(data: BinaryData): Buffer {
    return createHash('sha256').update(data).digest();
}

/** TriSHA1 采样大小：超过该值时采样头/中/尾三段。 */
const TRI_SHA1_SAMPLE_SIZE = 30 * 1024 * 1024;
/** TriSHA1 单段采样大小。 */
const TRI_SHA1_SLICE_SIZE = 10 * 1024 * 1024;
/** md510M 采样字节数（官方非整 10MB 的 10002432 字节）。 */
const MD5_10M_SIZE = 10002432;

/**
 * 计算文件 TriSHA1：文件 ≤30MB 时取全文件，否则取头/中/尾各 10MB，
 * 末尾拼接 8 字节小端文件大小后做 SHA1。
 */
export function triSha1(data: Buffer): Buffer {
    let sample: Buffer;
    if (data.length <= TRI_SHA1_SAMPLE_SIZE) {
        sample = data;
    } else {
        sample = Buffer.concat([
            data.subarray(0, TRI_SHA1_SLICE_SIZE),
            data.subarray(Math.floor(data.length / 2) - TRI_SHA1_SLICE_SIZE / 2, Math.floor(data.length / 2) + TRI_SHA1_SLICE_SIZE / 2),
            data.subarray(data.length - TRI_SHA1_SLICE_SIZE),
        ]);
    }
    const size = Buffer.alloc(8);
    size.writeBigUInt64LE(BigInt(data.length));
    return sha1(Buffer.concat([sample, size]));
}

/** 计算文件前 10002432 字节的 MD5（md510M）。 */
export function md510M(data: Buffer): Buffer {
    return md5(data.length <= MD5_10M_SIZE ? data : data.subarray(0, MD5_10M_SIZE));
}

const SHA1_BLOCK_SIZE = 64;
const SHA1_K = [
    0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xca62c1d6,
] as const;

/**
 * 流式 SHA1（对齐 acidify SHA1Stream）：可随时取未 padding 的原始中间态，
 * 用于视频闪传的 sha1StateV。
 */
export class Sha1Stream {
    private state = [0x67452301, 0xefcdab89 | 0, 0x98badcfe | 0, 0x10325476, 0xc3d2e1f0 | 0];
    private buffer = Buffer.alloc(SHA1_BLOCK_SIZE);
    private buffered = 0;
    /** 已处理的总比特数（64 位，低 32 位存 lengthLow）。 */
    private lengthLow = 0;
    private lengthHigh = 0;

    /** 更新原始中间态输出（小端序，对齐 SHA1Stream.hash(digest, bigEndian=false)）。 */
    private writeStateLittleEndian(out: Buffer): void {
        for (let i = 0; i < 5; i++) {
            out.writeUInt32LE(this.state[i]! >>> 0, i * 4);
        }
    }

    private transform(block: Buffer, offset: number): void {
        const w = new Uint32Array(80);
        for (let i = 0; i < 16; i++) {
            w[i] = block.readUInt32BE(offset + i * 4);
        }
        for (let i = 16; i < 80; i++) {
            const v = w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!;
            w[i] = ((v << 1) | (v >>> 31)) >>> 0;
        }
        let a = this.state[0]!;
        let b = this.state[1]!;
        let c = this.state[2]!;
        let d = this.state[3]!;
        let e = this.state[4]!;
        for (let i = 0; i < 80; i++) {
            let temp: number;
            let k: number;
            if (i < 20) {
                temp = (b & c) | (~b & d);
                k = SHA1_K[0];
            } else if (i < 40) {
                temp = b ^ c ^ d;
                k = SHA1_K[1];
            } else if (i < 60) {
                temp = (b & c) | (b & d) | (c & d);
                k = SHA1_K[2];
            } else {
                temp = b ^ c ^ d;
                k = SHA1_K[3];
            }
            const t = (((a << 5) | (a >>> 27)) + temp + e + k + w[i]!) >>> 0;
            e = d;
            d = c;
            c = ((b << 30) | (b >>> 2)) >>> 0;
            b = a;
            a = t;
        }
        this.state[0] = (this.state[0]! + a) >>> 0;
        this.state[1] = (this.state[1]! + b) >>> 0;
        this.state[2] = (this.state[2]! + c) >>> 0;
        this.state[3] = (this.state[3]! + d) >>> 0;
        this.state[4] = (this.state[4]! + e) >>> 0;
    }

    /** 喂数据（与 acidify update 一致）。 */
    update(data: Uint8Array): this {
        const bits = data.length * 8;
        const oldLow = this.lengthLow;
        this.lengthLow = (oldLow + bits) >>> 0;
        if (this.lengthLow < oldLow) {
            this.lengthHigh = (this.lengthHigh + 1) >>> 0;
        }
        this.lengthHigh = (this.lengthHigh + Math.floor(bits / 0x100000000)) >>> 0;

        let index = 0;
        if (this.buffered > 0) {
            const take = Math.min(this.buffered === 0 ? 0 : SHA1_BLOCK_SIZE - this.buffered, data.length);
            data.subarray(0, take).forEach((byte, i) => {
                this.buffer[this.buffered + i] = byte;
            });
            this.buffered += take;
            index = take;
            if (this.buffered === SHA1_BLOCK_SIZE) {
                this.transform(this.buffer, 0);
                this.buffered = 0;
            }
        }
        while (index + SHA1_BLOCK_SIZE <= data.length) {
            this.transform(Buffer.from(data.subarray(index, index + SHA1_BLOCK_SIZE)), 0);
            index += SHA1_BLOCK_SIZE;
        }
        if (index < data.length) {
            data.subarray(index).forEach((byte, i) => {
                this.buffer[i] = byte;
            });
            this.buffered = data.length - index;
        }
        return this;
    }

    /** 取当前累积态的小端序中间态副本（不 padding、不影响后续 update）。 */
    hashLittleEndian(): Buffer {
        const digest = Buffer.alloc(20);
        this.writeStateLittleEndian(digest);
        return digest;
    }

    /** 结束并输出标准大端 SHA1 摘要（对齐 SHA1Stream.final，此后不可再 update）。 */
    final(): Buffer {
        const bits = Buffer.alloc(8);
        bits.writeUInt32BE(this.lengthHigh, 0);
        bits.writeUInt32BE(this.lengthLow, 4);
        const padLen = this.buffered < 56 ? 56 - this.buffered : 120 - this.buffered;
        const padding = Buffer.alloc(padLen);
        padding[0] = 0x80;
        this.update(padding);
        this.update(bits);
        const digest = Buffer.alloc(20);
        for (let i = 0; i < 20; i++) {
            digest[i] = (this.state[i >>> 2]! >>> (24 - (i % 4) * 8)) & 0xff;
        }
        return digest;
    }
}
