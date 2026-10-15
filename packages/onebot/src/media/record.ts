const AMR_NB_SIZES = [12, 13, 15, 17, 19, 20, 26, 31, 5, 6, 7, 8, 9, 10, 11, 12];
const AMR_WB_SIZES = [17, 23, 32, 36, 40, 46, 50, 58, 60, 5, 6, 7, 8, 9, 10, 11];

/** 估算 AMR 语音时长（毫秒），非 AMR 返回 0。 */
export function amrDuration(data: Buffer): number {
    const header = data.subarray(0, 9).toString('latin1');
    const wideband = header === '#!AMR-WB\n';
    if (!wideband && data.subarray(0, 6).toString('latin1') !== '#!AMR\n') {
        return 0;
    }
    const sizes = wideband ? AMR_WB_SIZES : AMR_NB_SIZES;
    let offset = wideband ? 9 : 6;
    let frames = 0;
    while (offset < data.length) {
        const mode = ((data[offset] ?? 0) >> 3) & 0x0f;
        const frameSize = sizes[mode];
        if (frameSize === undefined || offset + 1 + frameSize > data.length) {
            break;
        }
        offset += 1 + frameSize;
        frames += 1;
    }
    return frames * 20;
}