import { DianaError, ErrorCode, PicFormat } from '@diana/core';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 图片元数据（尺寸与格式）。 */
export interface ImageFormatInfo {
    width: number;
    height: number;
    ext: string;
    format: PicFormat;
}

function jpegSize(data: Buffer): { width: number; height: number } | undefined {
    let offset = 2;
    while (offset + 9 <= data.length) {
        if (data[offset] !== 0xff) {
            offset += 1;
            continue;
        }
        const marker = data[offset + 1] ?? 0;
        // SOF 段（排除 DHT/JPG/DAC）
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
        }
        if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
            offset += 2;
            continue;
        }
        const length = data.readUInt16BE(offset + 2);
        if (length < 2) {
            return undefined;
        }
        offset += 2 + length;
    }
    return undefined;
}

function webpSize(data: Buffer): { width: number; height: number } | undefined {
    const format = data.subarray(12, 16).toString('latin1');
    if (format === 'VP8 ') {
        return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
    }
    if (format === 'VP8L') {
        const bits = data.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (format === 'VP8X') {
        return {
            width: (data.readUIntLE(24, 3) & 0xffffff) + 1,
            height: (data.readUIntLE(27, 3) & 0xffffff) + 1,
        };
    }
    return undefined;
}

/** 读取 TIFF IFD 中的图片尺寸（tag 0x0100 宽、0x0101 高）。 */
function tiffSize(data: Buffer): { width: number; height: number } | undefined {
    const little = data[0] === 0x49;
    const read16 = (offset: number) => (little ? data.readUInt16LE(offset) : data.readUInt16BE(offset));
    const read32 = (offset: number) => (little ? data.readUInt32LE(offset) : data.readUInt32BE(offset));
    if (read16(2) !== 42) {
        return undefined;
    }
    const offset = read32(4);
    if (offset + 2 > data.length) {
        return undefined;
    }
    const entryCount = read16(offset);
    let width: number | undefined;
    let height: number | undefined;
    for (let index = 0; index < entryCount; index += 1) {
        const entry = offset + 2 + index * 12;
        if (entry + 12 > data.length) {
            return undefined;
        }
        const tag = read16(entry);
        const type = read16(entry + 2);
        // SHORT(3) 与 LONG(4) 的值都内联在 8..12 字节
        const value = type === 3 ? read16(entry + 8) : type === 4 ? read32(entry + 8) : undefined;
        if (tag === 0x0100 && value !== undefined) {
            width = value;
        }
        if (tag === 0x0101 && value !== undefined) {
            height = value;
        }
    }
    return width !== undefined && height !== undefined ? { width, height } : undefined;
}

/**
 * 归一化图片数据：QQ 官方不支持 ICO 格式上传，若 ICO 内嵌 PNG 帧则直接提取为 PNG。
 */
export function normalizeImage(data: Buffer): Buffer {
    if (data.length >= 8 && data[0] === 0 && data[1] === 0 && data[2] === 1 && data[3] === 0) {
        const count = data.readUInt16LE(4);
        for (let index = 0; index < count; index += 1) {
            const entry = 6 + index * 16;
            if (entry + 16 > data.length) {
                break;
            }
            const size = data.readUInt32LE(entry + 8);
            const offset = data.readUInt32LE(entry + 12);
            if (offset + size <= data.length && data.subarray(offset, offset + 8).equals(PNG_SIGNATURE)) {
                return data.subarray(offset, offset + size);
            }
        }
    }
    return data;
}

/** 探测图片尺寸与格式，失败时抛出。 */
export function sniffImage(data: Buffer): ImageFormatInfo {
    if (data.length >= 24 && data.subarray(0, 8).equals(PNG_SIGNATURE)) {
        return { width: data.readUInt32BE(16), height: data.readUInt32BE(20), ext: 'png', format: PicFormat.PNG };
    }
    if (data.length >= 10 && data.subarray(0, 6).toString('latin1').startsWith('GIF8')) {
        return { width: data.readUInt16LE(6), height: data.readUInt16LE(8), ext: 'gif', format: PicFormat.GIF };
    }
    if (data.length >= 26 && data[0] === 0x42 && data[1] === 0x4d) {
        return {
            width: data.readInt32LE(18),
            height: Math.abs(data.readInt32LE(22)),
            ext: 'bmp',
            format: PicFormat.BMP,
        };
    }
    if (
        data.length >= 30 &&
        data.subarray(0, 4).toString('latin1') === 'RIFF' &&
        data.subarray(8, 12).toString('latin1') === 'WEBP'
    ) {
        const size = webpSize(data);
        if (size) {
            return { ...size, ext: 'webp', format: PicFormat.WEBP };
        }
    }
    if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
        const size = jpegSize(data);
        if (size) {
            return { ...size, ext: 'jpg', format: PicFormat.JPEG };
        }
    }
    if (
        data.length >= 10 &&
        ((data[0] === 0x49 && data[1] === 0x49 && data[2] === 0x2a && data[3] === 0) ||
            (data[0] === 0x4d && data[1] === 0x4d && data[2] === 0 && data[3] === 0x2a))
    ) {
        const size = tiffSize(data);
        if (size) {
            return { ...size, ext: 'tiff', format: PicFormat.TIFF };
        }
    }
    throw new DianaError(ErrorCode.Validation, '无法识别图片格式，支持 jpg/png/gif/bmp/webp/tiff');
}