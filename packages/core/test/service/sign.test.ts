import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUrlSignProvider, SIGN_COMMANDS } from '../../src/service/index.js';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('签名提供者', () => {
    it('向签名服务器提交命令与内容并解析结果', async () => {
        const calls: Array<{ url: string; body: unknown }> = [];
        vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
            calls.push({ url, body: JSON.parse(init.body) });
            return { ok: true, json: async () => ({ value: { sign: 'aabb', token: 'ccdd', extra: 'eeff' } }) };
        });

        const provider = createUrlSignProvider('https://sign.example.com/');
        const result = await provider.sign('wtlogin.login', Buffer.from('0123', 'hex'), 5);

        expect(calls[0].url).toBe('https://sign.example.com/');
        expect(calls[0].body).toEqual({ cmd: 'wtlogin.login', src: '0123', seq: 5 });
        expect(result).toEqual({
            sign: Buffer.from('aabb', 'hex'),
            token: Buffer.from('ccdd', 'hex'),
            extra: Buffer.from('eeff', 'hex'),
        });
    });

    it('签名服务器返回错误状态时抛错', async () => {
        vi.stubGlobal('fetch', async () => ({ ok: false, status: 500 }));
        const provider = createUrlSignProvider('https://sign.example.com/');
        await expect(provider.sign('wtlogin.login', Buffer.alloc(0), 0)).rejects.toThrow(/签名服务器返回 500/);
    });

    it('通过 /appinfo 接口获取远端 AppInfo', async () => {
        const urls: string[] = [];
        vi.stubGlobal('fetch', async (url: string) => {
            urls.push(url);
            return { ok: true, json: async () => ({ Os: 'Linux', CurrentVersion: '3.2.26-46494', NTLoginType: 1 }) };
        });

        const provider = createUrlSignProvider('http://sign.example.com:5991/');
        const appInfo = await provider.getAppInfo?.();

        expect(urls[0]).toBe('http://sign.example.com:5991/appinfo');
        expect(appInfo).toMatchObject({ Os: 'Linux', CurrentVersion: '3.2.26-46494' });
    });

    it('/appinfo 接口返回非 200 时返回 null', async () => {
        vi.stubGlobal('fetch', async () => ({ ok: false, status: 404 }));
        const provider = createUrlSignProvider('http://sign.example.com:5991');
        await expect(provider.getAppInfo?.()).resolves.toBeNull();
    });

    it('白名单包含登录与发消息命令', () => {
        expect(SIGN_COMMANDS.has('wtlogin.login')).toBe(true);
        expect(SIGN_COMMANDS.has('wtlogin.trans_emp')).toBe(true);
        expect(SIGN_COMMANDS.has('MessageSvc.PbSendMsg')).toBe(true);
        expect(SIGN_COMMANDS.has('test.cmd')).toBe(false);
    });
});
