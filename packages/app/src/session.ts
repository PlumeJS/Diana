import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** 持久化的登录会话（凭据以 base64 存储）。 */
export interface PersistedSession {
    uin: number;
    uid?: string;
    /** 设备 guid（十六进制），需与登录时一致。 */
    guid: string;
    a2: string;
    d2: string;
    d2Key: string;
    /** 登录时获得的 a1（base64），用于快速登录续期。 */
    a1?: string;
}

/** 读取会话文件，不存在或损坏时返回 undefined。 */
export function loadSession(path: string): PersistedSession | undefined {
    try {
        return JSON.parse(readFileSync(path, 'utf8')) as PersistedSession;
    } catch {
        return undefined;
    }
}

/** 写入会话文件（自动创建父目录）。 */
export function saveSession(path: string, session: PersistedSession): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(session, null, 2));
}
