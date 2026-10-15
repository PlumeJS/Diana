import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { BinaryData } from './digest.js';

/**
 * 使用 AES-256-GCM 加密，输出格式为 `iv(12) + 密文 + tag(16)`。
 */
export function aesGcmEncrypt(data: BinaryData, key: BinaryData): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    return Buffer.concat([iv, encrypted, cipher.getAuthTag()]);
}

/**
 * 解密 {@link aesGcmEncrypt} 的输出。
 */
export function aesGcmDecrypt(data: Buffer, key: BinaryData): Buffer {
    const iv = data.subarray(0, 12);
    const tag = data.subarray(-16);
    const cipher = data.subarray(12, data.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(cipher), decipher.final()]);
}
