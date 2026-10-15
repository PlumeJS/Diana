import { createLogger } from '@diana/core';
import type { OneBotContext } from './ctx.js';

/** 缓存有效期（毫秒）。 */
const DEFAULT_TTL = 60_000;

/** uid ↔ uin 解析缓存，缺失时按需从好友/群成员列表补充。 */
export class UidDirectory {
    private readonly log = createLogger('UidDirectory');
    private readonly uidToUin = new Map<string, number>();
    private friendLoadedAt = 0;
    private readonly groupLoadedAt = new Map<number, number>();

    constructor(
        private readonly ctx: OneBotContext,
        private readonly ttl = DEFAULT_TTL,
    ) {}

    /** 记录已知的 uid ↔ uin 映射。 */
    remember(uid: string | undefined, uin: number): void {
        if (uid) {
            this.uidToUin.set(uid, uin);
        }
    }

    /** 解析 uid 对应的 uin，无法解析时返回 0。 */
    async resolve(uid: string, groupUin?: number): Promise<number> {
        if (!uid) {
            return 0;
        }
        const cached = this.uidToUin.get(uid);
        if (cached !== undefined) {
            return cached;
        }
        if (groupUin !== undefined) {
            await this.loadGroupMembers(groupUin);
            const found = this.uidToUin.get(uid);
            if (found !== undefined) {
                return found;
            }
        }
        await this.loadFriends();
        return this.uidToUin.get(uid) ?? 0;
    }

    private async loadFriends(): Promise<void> {
        if (Date.now() - this.friendLoadedAt < this.ttl) {
            return;
        }
        try {
            const result = await this.ctx.friend.fetchFriends();
            for (const friend of result.friends) {
                this.remember(friend.uid, friend.uin);
            }
            this.friendLoadedAt = Date.now();
        } catch (error) {
            this.log.warn('拉取好友列表失败，uid 解析可能不完整', error);
        }
    }

    private async loadGroupMembers(groupUin: number): Promise<void> {
        if (Date.now() - (this.groupLoadedAt.get(groupUin) ?? 0) < this.ttl) {
            return;
        }
        try {
            const result = await this.ctx.group.fetchGroupMembers(groupUin);
            for (const member of result.members) {
                this.remember(member.uid, member.uin);
            }
            this.groupLoadedAt.set(groupUin, Date.now());
        } catch (error) {
            this.log.warn(`拉取群 ${groupUin} 成员失败，uid 解析可能不完整`, error);
        }
    }
}
