import { describe, expect, it } from 'vitest';
import type { OneBotContext } from '../src/ctx.js';
import { UidDirectory } from '../src/directory.js';

interface FakeOptions {
    friends?: Array<{ uin: number; uid: string }>;
    members?: Record<number, Array<{ uin: number; uid: string }>>;
}

function createFakeContext(options: FakeOptions = {}) {
    let friendCalls = 0;
    const groupCalls = new Map<number, number>();
    const ctx = {
        friend: {
            fetchFriends: async () => {
                friendCalls += 1;
                return { friends: options.friends ?? [], categories: [] };
            },
        },
        group: {
            fetchGroupMembers: async (groupUin: number) => {
                groupCalls.set(groupUin, (groupCalls.get(groupUin) ?? 0) + 1);
                return { members: options.members?.[groupUin] ?? [] };
            },
        },
    } as unknown as OneBotContext;
    return { ctx, friendCalls: () => friendCalls, groupCalls: () => groupCalls };
}

describe('uid 解析目录', () => {
    it('已记录的映射直接命中，不触发拉取', async () => {
        const { ctx, friendCalls } = createFakeContext();
        const directory = new UidDirectory(ctx);
        directory.remember('u_a', 20001);
        expect(await directory.resolve('u_a', 888)).toBe(20001);
        expect(friendCalls()).toBe(0);
    });

    it('群内缺失时拉取群成员', async () => {
        const { ctx, friendCalls } = createFakeContext({ members: { 888: [{ uin: 20002, uid: 'u_b' }] } });
        const directory = new UidDirectory(ctx);
        expect(await directory.resolve('u_b', 888)).toBe(20002);
        expect(friendCalls()).toBe(0);
    });

    it('好友兜底并按 TTL 复用缓存', async () => {
        const { ctx, friendCalls } = createFakeContext({ friends: [{ uin: 20003, uid: 'u_c' }] });
        const directory = new UidDirectory(ctx);
        expect(await directory.resolve('u_c')).toBe(20003);
        expect(await directory.resolve('u_missing')).toBe(0);
        expect(friendCalls()).toBe(1);
    });
});
