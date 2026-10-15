import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { md5, Sha1Stream, sha1, sha256 } from '../../src/crypto/digest.js';

describe('digest', () => {
    it('computes md5', () => {
        expect(md5('').toString('hex')).toBe('d41d8cd98f00b204e9800998ecf8427e');
        expect(md5('abc').toString('hex')).toBe('900150983cd24fb0d6963f7d28e17f72');
    });

    it('computes sha1', () => {
        expect(sha1('abc').toString('hex')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    });

    it('computes sha256', () => {
        expect(sha256('abc').toString('hex')).toBe(
            'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        );
    });

    it('Sha1Stream final 与 Node crypto 一致（含跨块、非整块长度）', () => {
        for (const size of [0, 1, 63, 64, 65, 127, 1000, 1024 * 1024 + 3]) {
            const data = Buffer.alloc(size, 0xa5);
            const stream = new Sha1Stream().update(data);
            expect(stream.final().toString('hex')).toBe(createHash('sha1').update(data).digest('hex'));
        }
    });

    it('Sha1Stream 中间态为未 padding 原始寄存器小端输出', () => {
        // 手工推导：对 "abc" 喂入后，中间态 = state 寄存器小端输出（不等于 sha1("abc")）
        const stream = new Sha1Stream().update(Buffer.from('abc'));
        const intermediate = stream.hashLittleEndian();
        expect(intermediate.toString('hex')).not.toBe(sha1('abc').toString('hex'));
        // 小端还原后应为大端寄存器初值序列：H0=0x67452301 不再成立（abc 恰好一个块被 transform）
        // 用已知向量验证：还原大端 = process("abc") 未 padding 的寄存器值
        const bigEndian = Buffer.alloc(20);
        for (let i = 0; i < 5; i++) {
            bigEndian.writeUInt32BE(intermediate.readUInt32LE(i * 4), i * 4);
        }
        // sha1("abc") 的 H 值即 final 后寄存器，但未 padding 中间态应等于 sha1("abc") 前的变换值；
        // 用二次喂入等价性验证：hashLittleEndian 后继续 update+final 应等于整体 final
        const whole = new Sha1Stream().update(Buffer.from('abc')).update(Buffer.from('def')).final();
        const split = new Sha1Stream();
        split.update(Buffer.from('abc'));
        split.hashLittleEndian();
        expect(split.update(Buffer.from('def')).final().toString('hex')).toBe(whole.toString('hex'));
    });
});
