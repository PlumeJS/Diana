/** 为 SSO 载荷添加 `uint32` 长度前缀（长度含前缀自身），得到可直接写入连接的帧。 */
export function encodeSsoFrame(payload: Buffer): Buffer {
    const frame = Buffer.allocUnsafe(payload.length + 4);
    frame.writeUInt32BE(payload.length + 4, 0);
    payload.copy(frame, 4);
    return frame;
}

/** SSO 帧读取器：从 TCP 字节流中切分出完整的 SSO 包。 */
export class SsoFrameReader {
    private buffer: Buffer = Buffer.alloc(0);

    /** 追加新数据，返回其中已完整的帧载荷。 */
    push(chunk: Buffer): Buffer[] {
        this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
        const frames: Buffer[] = [];
        while (this.buffer.length >= 4) {
            const length = this.buffer.readUInt32BE(0);
            if (this.buffer.length < length) {
                break;
            }
            frames.push(this.buffer.subarray(4, length));
            this.buffer = this.buffer.subarray(length);
        }
        return frames;
    }

    /** 清空缓冲区。 */
    reset(): void {
        this.buffer = Buffer.alloc(0);
    }
}
