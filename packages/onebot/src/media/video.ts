import { DianaError, ErrorCode } from '@diana/core';
import type { VideoMeta } from '@diana/core';

/**
 * 探测 MP4 视频的宽高与时长（秒）。
 * 解析 moov/mvhd 取时长，tkhd 取宽高；失败时抛出校验错误。
 * 单位对齐 acidify：FileInfo.time 填秒（duration.toInt()）。
 */
export function probeVideo(data: Buffer): VideoMeta {
    const duration = probeMvhdDuration(data);
    const size = probeTkhdSize(data);
    if (duration <= 0 || size.width === 0 || size.height === 0) {
        throw new DianaError(ErrorCode.Validation, '无法解析视频元数据（仅支持 MP4）');
    }
    return { duration, ...size };
}

/** 解析 mvhd 得到时长（秒）。 */
function probeMvhdDuration(data: Buffer): number {
    const box = findBox(data, 'mvhd');
    if (!box) {
        return 0;
    }
    const version = box.readUInt8(0);
    if (version === 1) {
        const timescale = box.readUInt32BE(20);
        const duration = Number(box.readBigUInt64BE(24));
        return timescale > 0 ? Math.round(duration / timescale) : 0;
    }
    const timescale = box.readUInt32BE(12);
    const duration = box.readUInt32BE(16);
    return timescale > 0 ? Math.round(duration / timescale) : 0;
}

/** 解析第一个 tkhd 得到宽高。 */
function probeTkhdSize(data: Buffer): { width: number; height: number } {
    const box = findBox(data, 'tkhd');
    if (!box) {
        return { width: 0, height: 0 };
    }
    const version = box.readUInt8(0);
    // tkhd 尾部固定 width/height 各 4 字节（16.16 定点数）
    const offset = version === 1 ? box.length - 8 : box.length - 8;
    return {
        width: box.readUInt32BE(offset) >> 16,
        height: box.readUInt32BE(offset + 4) >> 16,
    };
}

/** 在 ISO-BMFF 结构中查找指定类型的最顶层 box（跳过 ftyp 后逐层扫描 moov）。 */
function findBox(data: Buffer, type: string): Buffer | undefined {
    // moov 通常在文件前部，最多扫描 4MB；未找到再全量兜底
    for (const limit of [Math.min(data.length, 4 * 1024 * 1024), data.length]) {
        let offset = 0;
        while (offset + 8 <= limit) {
            const size = data.readUInt32BE(offset);
            const boxType = data.subarray(offset + 4, offset + 8).toString('latin1');
            if (size < 8 || offset + size > data.length) {
                break;
            }
            if (boxType === type) {
                return data.subarray(offset + 8, offset + size);
            }
            // moov/mdia 等容器需要深入子 box 查找
            if (boxType === 'moov' || boxType === 'mdia' || boxType === 'trak' || boxType === 'minf') {
                const inner = findBox(data.subarray(offset + 8, offset + size), type);
                if (inner) {
                    return inner;
                }
            }
            offset += size;
        }
        if (limit >= data.length) {
            break;
        }
    }
    return undefined;
}
