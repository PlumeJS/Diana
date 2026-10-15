import { PicFormat } from '@diana/core';
import { describe, expect, it } from 'vitest';
import { amrDuration, normalizeImage, resolveFile, sniffImage } from '../../src/media/index.js';

function png(width: number, height: number): Buffer {
    const buffer = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
    buffer.writeUInt32BE(width, 16);
    buffer.writeUInt32BE(height, 20);
    return buffer;
}

function gif(width: number, height: number): Buffer {
    const buffer = Buffer.alloc(10);
    buffer.write('GIF89a', 0, 'latin1');
    buffer.writeUInt16LE(width, 6);
    buffer.writeUInt16LE(height, 8);
    return buffer;
}

function bmp(width: number, height: number): Buffer {
    const buffer = Buffer.alloc(26);
    buffer.write('BM', 0, 'latin1');
    buffer.writeInt32LE(width, 18);
    buffer.writeInt32LE(height, 22);
    return buffer;
}

function jpeg(width: number, height: number): Buffer {
    const buffer = Buffer.alloc(11);
    buffer[0] = 0xff;
    buffer[1] = 0xd8;
    buffer[2] = 0xff;
    buffer[3] = 0xc0;
    buffer.writeUInt16BE(0x11, 4);
    buffer[6] = 8;
    buffer.writeUInt16BE(height, 7);
    buffer.writeUInt16BE(width, 9);
    return buffer;
}

function tiff(width: number, height: number, little = true): Buffer {
    const buffer = Buffer.alloc(34);
    const write16 = (offset: number, value: number) =>
        little ? buffer.writeUInt16LE(value, offset) : buffer.writeUInt16BE(value, offset);
    const write32 = (offset: number, value: number) =>
        little ? buffer.writeUInt32LE(value, offset) : buffer.writeUInt32BE(value, offset);
    // 头：字节序标记 + 魔数 42 + 首个 IFD 偏移
    buffer.write(little ? 'II' : 'MM', 0, 'latin1');
    write16(2, 42);
    write32(4, 8);
    // IFD：条目数 + 2 个条目（tag/type/count/value）
    write16(8, 2);
    write16(10, 0x0100);
    write16(12, 3);
    write32(14, 1);
    write16(18, width);
    write16(22, 0x0101);
    write16(24, 3);
    write32(26, 1);
    write16(30, height);
    return buffer;
}

/** 内嵌一帧 PNG 的 ICO。 */
function icoWithPng(frame: Buffer): Buffer {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2); // type = icon
    header.writeUInt16LE(1, 4); // 1 帧
    const entry = Buffer.alloc(16);
    entry.writeUInt32LE(frame.length, 8);
    entry.writeUInt32LE(6 + 16, 12);
    return Buffer.concat([header, entry, frame]);
}

describe('图片探测', () => {
    it('PNG', () => {
        expect(sniffImage(png(640, 480))).toEqual({ width: 640, height: 480, ext: 'png', format: PicFormat.PNG });
    });

    it('GIF', () => {
        expect(sniffImage(gif(16, 8))).toEqual({ width: 16, height: 8, ext: 'gif', format: PicFormat.GIF });
    });

    it('BMP', () => {
        expect(sniffImage(bmp(32, 24))).toEqual({ width: 32, height: 24, ext: 'bmp', format: PicFormat.BMP });
    });

    it('JPEG', () => {
        expect(sniffImage(jpeg(800, 600))).toEqual({ width: 800, height: 600, ext: 'jpg', format: PicFormat.JPEG });
    });

    it('TIFF（小端）', () => {
        expect(sniffImage(tiff(64, 32))).toEqual({ width: 64, height: 32, ext: 'tiff', format: PicFormat.TIFF });
    });

    it('TIFF（大端）', () => {
        expect(sniffImage(tiff(48, 16, false))).toEqual({ width: 48, height: 16, ext: 'tiff', format: PicFormat.TIFF });
    });

    it('ICO 内嵌 PNG 帧提取', () => {
        const frame = png(32, 32);
        expect(normalizeImage(icoWithPng(frame))).toEqual(frame);
    });

    it('非 ICO 原样返回', () => {
        const frame = png(8, 8);
        expect(normalizeImage(frame)).toBe(frame);
    });

    it('无法识别时抛错', () => {
        expect(() => sniffImage(Buffer.from('not an image'))).toThrow();
    });
});

describe('语音时长', () => {
    it('解析 AMR-NB 帧数', () => {
        const buffer = Buffer.concat([
            Buffer.from('#!AMR\n', 'latin1'),
            Buffer.from([0x3c, ...new Array(31).fill(0)]), // mode 7 -> 31 字节
            Buffer.from([0x3c, ...new Array(31).fill(0)]),
        ]);
        expect(amrDuration(buffer)).toBe(40);
    });

    it('非 AMR 返回 0', () => {
        expect(amrDuration(Buffer.from('not amr'))).toBe(0);
    });
});

describe('文件解析', () => {
    it('base64:// 前缀', async () => {
        expect(await resolveFile('base64://aGVsbG8=')).toEqual(Buffer.from('hello'));
    });

    it('裸 base64', async () => {
        expect(await resolveFile('aGVsbG8=')).toEqual(Buffer.from('hello'));
    });

    it('data URL（base64）', async () => {
        expect(await resolveFile('data:image/png;base64,aGVsbG8=')).toEqual(Buffer.from('hello'));
    });

    it('data URL（URL 编码）', async () => {
        expect(await resolveFile('data:text/plain,hello%20world')).toEqual(Buffer.from('hello world'));
    });
});
