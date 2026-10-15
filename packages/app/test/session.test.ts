import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadSession, saveSession } from '../src/session.js';

const dirs: string[] = [];

function tempFile(name: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'diana-'));
    dirs.push(dir);
    return join(dir, name);
}

afterEach(() => {
    for (const dir of dirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true });
    }
});

describe('会话持久化', () => {
    it('保存后可读回（自动创建父目录）', () => {
        const path = tempFile('nested/session.json');
        const session = { uin: 10000, uid: 'u_x', guid: 'ab', a2: 'YQ==', d2: 'Yg==', d2Key: 'Yw==' };
        saveSession(path, session);
        expect(loadSession(path)).toEqual(session);
    });

    it('文件不存在返回 undefined', () => {
        expect(loadSession(tempFile('missing.json'))).toBeUndefined();
    });
});
