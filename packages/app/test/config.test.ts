import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config.js';

describe('配置解析', () => {
    it('空配置使用默认值', () => {
        expect(parseConfig({})).toEqual({
            protocol: {
                os: 'windows',
                version: '',
                host: 'msfwifi.3g.qq.com',
                port: 8080,
                signServer: '',
                signToken: '',
                interval: 5000,
            },
            onebot: {},
            log: { level: 'info' },
            sessionFile: '.diana/session.json',
            qrImageFile: '.diana/qrcode.png',
        });
    });

    it('完整配置原样保留', () => {
        expect(
            parseConfig({
                protocol: {
                    os: 'linux',
                    version: '9.9.35-52892',
                    server: 'http://example.com:1234/',
                    signServer: 'https://sign.example.com/',
                    signToken: 'tok',
                    interval: 1000,
                },
                onebot: { forwardWs: { port: 3000 }, accessToken: 't' },
                log: { level: 'debug' },
                sessionFile: 'a.json',
                qrImageFile: 'b.png',
            }),
        ).toEqual({
            protocol: {
                os: 'linux',
                version: '9.9.35-52892',
                host: 'example.com',
                port: 1234,
                signServer: 'https://sign.example.com/',
                signToken: 'tok',
                interval: 1000,
            },
            onebot: { forwardWs: { port: 3000 }, accessToken: 't' },
            log: { level: 'debug' },
            sessionFile: 'a.json',
            qrImageFile: 'b.png',
        });
    });

    it('server 省略端口时使用默认端口', () => {
        expect(parseConfig({ protocol: { server: 'example.com' } }).protocol).toMatchObject({
            host: 'example.com',
            port: 8080,
        });
    });

    it('缺少必填端口时抛错', () => {
        expect(() => parseConfig({ onebot: { forwardWs: { host: 'x' } } })).toThrow();
    });
});
