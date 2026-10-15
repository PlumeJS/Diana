import { describe, expect, it } from 'vitest';
import { appInfoFor, overrideAppInfo, WINDOWS_APP_INFO } from '../../src/common/app-info.js';

describe('AppInfo 预设', () => {
    it('按平台取预设', () => {
        expect(appInfoFor('windows')).toBe(WINDOWS_APP_INFO);
        expect(appInfoFor('linux').Os).toBe('Linux');
    });

    it('version 覆盖客户端版本，其余沿用预设', () => {
        const info = appInfoFor('windows', '9.9.40-60000');
        expect(info.CurrentVersion).toBe('9.9.40-60000');
        expect(info.AppClientVersion).toBe(60000);
        expect(info.AppId).toBe(WINDOWS_APP_INFO.AppId);
    });

    it('自定义数据覆盖预设，未提供的字段沿用预设', () => {
        const info = overrideAppInfo(WINDOWS_APP_INFO, { AppId: 123, CurrentVersion: '1.2.3-4' });
        expect(info.AppId).toBe(123);
        expect(info.CurrentVersion).toBe('1.2.3-4');
        expect(info.SubAppId).toBe(WINDOWS_APP_INFO.SubAppId);
    });
});
