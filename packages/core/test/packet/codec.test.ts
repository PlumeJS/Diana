import { randomBytes } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decryptTea, encryptTea } from '../../src/crypto/tea.js';
import {
    CompressionType,
    decodeSsoPacket,
    EMPTY_TEA_KEY,
    encodeSsoPacket,
    EncryptionType,
    incomingSsoPacketSchema,
    incomingSsoPacketWrapperSchema,
    outgoingSsoPacketSchema,
    outgoingSsoPacketWrapperSchema,
    SSO_PROTOCOL,
} from '../../src/packet/index.js';
import { decodeTlv, encodeTlv } from '../../src/tlv/index.js';
import type { TlvData } from '../../src/tlv/index.js';

interface IncomingOptions {
    d2Key?: Buffer;
    command: string;
    sequence: number;
    body?: Buffer;
    retcode?: number;
    extra?: string;
    compressionType?: CompressionType;
    protocol?: number;
}

function buildIncoming(options: IncomingOptions): Buffer {
    const hasKey = (options.d2Key?.length ?? 0) > 0;
    const key = hasKey ? options.d2Key! : EMPTY_TEA_KEY;
    const inner = encodeTlv(incomingSsoPacketSchema, {
        header: {
            sequence: options.sequence,
            retcode: options.retcode ?? 0,
            extra: options.extra ?? '',
            command: options.command,
            msgCookie: Buffer.alloc(0),
            compressionType: options.compressionType ?? CompressionType.None,
            reserveField: Buffer.alloc(0),
        } satisfies TlvData,
        raw: options.body ?? Buffer.alloc(0),
    });
    return encodeTlv(incomingSsoPacketWrapperSchema, {
        protocol: options.protocol ?? SSO_PROTOCOL,
        encryptionType: hasKey ? EncryptionType.TeaByD2Key : EncryptionType.TeaByEmptyKey,
        flag2: 0,
        uin: '10000',
        packet: encryptTea(inner, key),
    });
}

describe('sso codec', () => {
    it('decodes a plain incoming packet', () => {
        const packet = buildIncoming({ command: 'test.cmd', sequence: 4001, body: Buffer.from('hello') });
        const decoded = decodeSsoPacket(packet, EMPTY_TEA_KEY);
        expect(decoded).toEqual({ command: 'test.cmd', sequence: 4001, body: Buffer.from('hello') });
    });

    it('decodes a packet encrypted with d2Key', () => {
        const d2Key = randomBytes(16);
        const packet = buildIncoming({ command: 'enc.cmd', sequence: 7, body: Buffer.from('secret'), d2Key });
        const decoded = decodeSsoPacket(packet, d2Key);
        expect(decoded).toMatchObject({ command: 'enc.cmd', sequence: 7, body: Buffer.from('secret') });
    });

    it('decodes a zlib-compressed body', () => {
        const body = Buffer.from('x'.repeat(512));
        const packet = buildIncoming({
            command: 'zip.cmd',
            sequence: 8,
            body: deflateSync(body),
            compressionType: CompressionType.Zlib,
        });
        const decoded = decodeSsoPacket(packet, EMPTY_TEA_KEY);
        expect(decoded).toMatchObject({ body });
    });

    it('returns retcode and extra when the packet failed', () => {
        const packet = buildIncoming({ command: 'fail.cmd', sequence: 9, retcode: 1, extra: 'boom' });
        const decoded = decodeSsoPacket(packet, EMPTY_TEA_KEY);
        expect(decoded).toEqual({ command: 'fail.cmd', sequence: 9, retcode: 1, extra: 'boom' });
    });

    it('rejects unsupported protocol versions', () => {
        const packet = buildIncoming({ command: 'x', sequence: 1, protocol: 11 });
        expect(() => decodeSsoPacket(packet, EMPTY_TEA_KEY)).toThrow();
    });

    it('rejects a wrong d2Key', () => {
        const packet = buildIncoming({ command: 'enc.cmd', sequence: 2, body: Buffer.from('data'), d2Key: randomBytes(16) });
        expect(() => decodeSsoPacket(packet, randomBytes(16))).toThrow();
    });

    it('encodes an outgoing packet with the empty key when logged out', () => {
        const body = Buffer.from('payload');
        const packet = encodeSsoPacket({
            header: { sequence: 5, subAppId: 1, a2: Buffer.from('a2'), command: 'send.cmd', guid: 'abcdef', version: '9.9.9' },
            body,
            uin: '10001',
            d2: Buffer.alloc(0),
            d2Key: Buffer.alloc(0),
        });
        const wrapper = decodeTlv(outgoingSsoPacketWrapperSchema, packet);
        expect(wrapper['protocol']).toBe(SSO_PROTOCOL);
        expect(wrapper['encryptionType']).toBe(EncryptionType.TeaByEmptyKey);
        const inner = decodeTlv(outgoingSsoPacketSchema, decryptTea(wrapper['encrypted'] as Buffer, EMPTY_TEA_KEY));
        const header = inner['header'] as TlvData;
        expect(header['command']).toBe('send.cmd');
        expect(header['sequence']).toBe(5);
        expect((inner['body'] as Buffer).equals(body)).toBe(true);
    });

    it('encodes an outgoing packet with d2Key when logged in', () => {
        const d2 = randomBytes(16);
        const d2Key = randomBytes(16);
        const packet = encodeSsoPacket({
            header: { sequence: 6, subAppId: 1, a2: Buffer.from('a2'), command: 'send.cmd', guid: 'abcdef', version: '9.9.9' },
            body: Buffer.from('x'),
            uin: '10001',
            d2,
            d2Key,
        });
        const wrapper = decodeTlv(outgoingSsoPacketWrapperSchema, packet);
        expect(wrapper['encryptionType']).toBe(EncryptionType.TeaByD2Key);
        expect((wrapper['d2'] as Buffer).equals(d2)).toBe(true);
        expect(() => decryptTea(wrapper['encrypted'] as Buffer, d2Key)).not.toThrow();
    });

    it('encodes an unencrypted outgoing packet when requested', () => {
        const body = Buffer.from('alive');
        const packet = encodeSsoPacket({
            header: { sequence: 7, subAppId: 1, a2: Buffer.from('a2'), command: 'Heartbeat.Alive', guid: 'abcdef', version: '9.9.9' },
            body,
            uin: '10001',
            d2: randomBytes(16),
            d2Key: randomBytes(16),
            encryption: EncryptionType.None,
        });
        const wrapper = decodeTlv(outgoingSsoPacketWrapperSchema, packet);
        expect(wrapper['encryptionType']).toBe(EncryptionType.None);
        expect((wrapper['d2'] as Buffer).length).toBe(0);
        const inner = decodeTlv(outgoingSsoPacketSchema, wrapper['encrypted'] as Buffer);
        const header = inner['header'] as TlvData;
        expect(header['command']).toBe('Heartbeat.Alive');
        expect((inner['body'] as Buffer).equals(body)).toBe(true);
    });
});
