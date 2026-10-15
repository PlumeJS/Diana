import { describe, expect, it } from 'vitest';
import { encodeSsoFrame, SsoFrameReader } from '../../src/packet/index.js';

describe('sso frame', () => {
    it('encodes the length including the prefix', () => {
        const frame = encodeSsoFrame(Buffer.from('abc'));
        expect(frame.readUInt32BE(0)).toBe(7);
        expect(frame.subarray(4).toString()).toBe('abc');
    });

    it('splits multiple frames delivered in one chunk', () => {
        const reader = new SsoFrameReader();
        const combined = Buffer.concat([encodeSsoFrame(Buffer.from('aaa')), encodeSsoFrame(Buffer.from('bbbb'))]);
        const frames = reader.push(combined).map((frame) => frame.toString());
        expect(frames).toEqual(['aaa', 'bbbb']);
    });

    it('buffers partial frames across chunks', () => {
        const reader = new SsoFrameReader();
        const combined = Buffer.concat([encodeSsoFrame(Buffer.from('first')), encodeSsoFrame(Buffer.from('second'))]);
        expect(reader.push(combined.subarray(0, 4))).toHaveLength(0);
        expect(reader.push(combined.subarray(4, 8))).toHaveLength(0);
        const frames = reader.push(combined.subarray(8)).map((frame) => frame.toString());
        expect(frames).toEqual(['first', 'second']);
    });

    it('resets the internal buffer', () => {
        const reader = new SsoFrameReader();
        reader.push(encodeSsoFrame(Buffer.from('partial')).subarray(0, 5));
        reader.reset();
        const frames = reader.push(encodeSsoFrame(Buffer.from('ok'))).map((frame) => frame.toString());
        expect(frames).toEqual(['ok']);
    });
});
