import {
    fetchGroupExtraInfoContract,
    fetchGroupExtraInfoResponseContract,
    fetchGroupMembersContract,
    fetchGroupMembersResponseContract,
    fetchGroupNotificationsContract,
    fetchGroupNotificationsResponseContract,
    fetchGroupsContract,
    fetchGroupsResponseContract,
    kickMemberContract,
    muteAllMembersContract,
    muteMemberContract,
    addGroupReactionContract,
    nudgeContract,
    quitGroupContract,
    removeGroupReactionContract,
    setGroupFilteredRequestContract,
    setGroupRequestContract,
    setGroupNameContract,
    setMemberAdminContract,
    setMemberCardContract,
    setMemberTitleContract,
} from '../packet/oidb/index.js';
import { randomInt } from 'node:crypto';
import type { GroupMemberPermission } from '../packet/oidb/index.js';
import { DianaError, ErrorCode } from '../common/errors.js';
import type { OidbService } from './oidb.js';

function randomUInt32(): number {
    return randomInt(0, 0x1_0000_0000);
}

/** 群信息。 */
export interface Group {
    groupUin: number;
    ownerUid: string;
    createdTime: number;
    memberMax: number;
    memberCount: number;
    name: string;
    description: string;
    question: string;
    announcement: string;
}

/** 群成员信息。 */
export interface GroupMember {
    uin: number;
    uid: string;
    nickname: string;
    card: string;
    level: number;
    specialTitle: string;
    joinTimestamp: number;
    lastMsgTimestamp: number;
    shutUpEndTimestamp?: number;
    permission: GroupMemberPermission;
}

/** 群成员列表结果。 */
export interface FetchGroupMembersResult {
    members: GroupMember[];
    token?: string;
}

/** 群通知类型（对齐官方 0x10c0_1）。 */
export enum GroupNotificationType {
    /** 申请入群。 */
    Join = 1,
    /** 设置管理员。 */
    SetAdmin = 3,
    /** 他人被移出。 */
    Kick = 6,
    /** 自己被移出。 */
    KickSelf = 7,
    /** 主动退群。 */
    Exit = 13,
    /** 取消管理员。 */
    UnsetAdmin = 16,
    /** 邀请入群。 */
    Invite = 22,
}

/** 群通知状态。 */
export enum GroupNotificationState {
    Wait = 1,
    Accept = 2,
    Reject = 3,
    Ignore = 4,
}

/** 群通知条目。 */
export interface GroupNotification {
    sequence: number;
    type: number;
    state: number;
    groupUin: number;
    targetUid: string;
    invitorUid?: string;
    operatorUid?: string;
    comment: string;
}

/** 群相关接口。 */
export class GroupService {
    constructor(private readonly oidb: OidbService) {}

    /** 拉取群列表。 */
    async fetchGroups(): Promise<Group[]> {
        const response = await this.oidb.call(fetchGroupsContract, fetchGroupsResponseContract, {
            config: {
                config1: {
                    groupOwner: true,
                    field2: true,
                    memberMax: true,
                    memberCount: true,
                    groupName: true,
                    field8: true,
                    field9: true,
                    field10: true,
                    field11: true,
                    field12: true,
                    field13: true,
                    field14: true,
                    field15: true,
                    field16: true,
                    field17: true,
                    field18: true,
                    question: true,
                    field20: true,
                    field22: true,
                    field23: true,
                    field24: true,
                    field25: true,
                    field26: true,
                    field27: true,
                    field28: true,
                    field29: true,
                    field30: true,
                    field31: true,
                    field32: true,
                    field5001: true,
                    field5002: true,
                    field5003: true,
                },
                config2: {
                    field1: true,
                    field2: true,
                    field3: true,
                    field4: true,
                    field5: true,
                    field6: true,
                    field7: true,
                    field8: true,
                },
                config3: { field5: true, field6: true },
            },
        });

        return (response.groups ?? []).map((raw) => ({
            groupUin: raw.groupUin,
            ownerUid: raw.info?.groupOwner?.uid ?? '',
            createdTime: raw.info?.createdTime ?? 0,
            memberMax: raw.info?.memberMax ?? 0,
            memberCount: raw.info?.memberCount ?? 0,
            name: raw.info?.groupName ?? '',
            description: raw.info?.description ?? '',
            question: raw.info?.question ?? '',
            announcement: raw.info?.announcement ?? '',
        }));
    }

    /** 拉取群成员列表（分页）。 */
    async fetchGroupMembers(groupUin: number, token?: string): Promise<FetchGroupMembersResult> {
        const response = await this.oidb.call(fetchGroupMembersContract, fetchGroupMembersResponseContract, {
            groupUin,
            queried: {
                memberName: true,
                memberCard: true,
                level: true,
                specialTitle: true,
                joinTimestamp: true,
                lastMsgTimestamp: true,
                shutUpEndTimestamp: true,
                permission: true,
            },
            token,
        });

        return {
            token: response.token,
            members: (response.members ?? []).map((raw) => ({
                uin: raw.identity.uin,
                uid: raw.identity.uid ?? '',
                nickname: raw.memberName ?? '',
                card: raw.memberCard?.value ?? '',
                level: raw.level?.level ?? 0,
                specialTitle: raw.specialTitle?.toString() ?? '',
                joinTimestamp: raw.joinTimestamp,
                lastMsgTimestamp: raw.lastMsgTimestamp,
                shutUpEndTimestamp: raw.shutUpEndTimestamp,
                permission: raw.permission as GroupMemberPermission,
            })),
        };
    }

    /** 拉取群通知列表（对齐官方 OidbSvcTrpcTcp.0x10c0_1）。 */
    async fetchGroupNotifications(count: number, startSequence = 0): Promise<GroupNotification[]> {
        const response = await this.oidb.call(fetchGroupNotificationsContract, fetchGroupNotificationsResponseContract, {
            count: BigInt(count),
            startSequence: BigInt(startSequence),
        });
        return (response.notifications ?? []).map((raw) => ({
            sequence: Number(raw.sequence),
            type: Number(raw.type),
            state: Number(raw.state),
            groupUin: Number(raw.group?.groupUin ?? 0n),
            targetUid: raw.target?.uid ?? '',
            invitorUid: raw.invitor?.uid,
            operatorUid: raw.operator?.uid,
            comment: raw.comment ?? '',
        }));
    }

    /** 禁言/解禁群成员（duration 为 0 表示解禁）。 */
    async muteMember(groupUin: number, targetUid: string, duration: number): Promise<void> {
        await this.oidb.send(muteMemberContract, { groupUin, type: 1, body: { targetUid, duration } });
    }

    /** 开启/关闭全员禁言。 */
    async muteAllMembers(groupUin: number, enable: boolean): Promise<void> {
        await this.oidb.send(muteAllMembersContract, { groupUin, body: { duration: enable ? 1 : 0 } });
    }

    /** 设置群成员名片。 */
    async setMemberCard(groupUin: number, targetUid: string, card: string): Promise<void> {
        await this.oidb.send(setMemberCardContract, { groupUin, body: { targetUid, card } });
    }

    /** 移出群成员。 */
    async kickMember(groupUin: number, targetUid: string, rejectSubsequentRequests = false, reason = ''): Promise<void> {
        await this.oidb.send(kickMemberContract, { groupUin, memberUid: targetUid, rejectSubsequentRequests, reason });
    }

    /** 设置群名称。 */
    async setGroupName(groupUin: number, name: string): Promise<void> {
        await this.oidb.send(setGroupNameContract, { groupUin, body: { name } });
    }

    /** 戳一戳群成员。 */
    async pokeMember(groupUin: number, uin: number): Promise<void> {
        await this.oidb.send(nudgeContract, { toUin: BigInt(uin), groupCode: BigInt(groupUin) });
    }

    /** 给群消息贴/取消表情回应（对齐 acidify 0x9082_1/2）。 */
    async setMessageReaction(groupUin: number, sequence: number, code: string, reactionType: number, add: boolean): Promise<void> {
        await this.oidb.send(add ? addGroupReactionContract : removeGroupReactionContract, {
            groupCode: BigInt(groupUin),
            sequence: BigInt(sequence),
            code,
            reactionType,
        });
    }

    /** 拉取群最新消息序列号。 */
    async fetchLatestMessageSeq(groupUin: number): Promise<number> {
        const response = await this.oidb.call(
            fetchGroupExtraInfoContract,
            fetchGroupExtraInfoResponseContract,
            {
                random: randomUInt32(),
                config: { groupUin: BigInt(groupUin), flags: { latestMessageSeq: true } },
            },
        );
        return Number(response.info?.results?.latestMessageSeq ?? 0);
    }

    /** 主动退群/解散群。 */
    async quitGroup(groupUin: number): Promise<void> {
        await this.oidb.send(quitGroupContract, { groupCode: BigInt(groupUin) });
    }

    /** 设置/取消群管理员。 */
    async setMemberAdmin(groupUin: number, targetUid: string, isAdmin: boolean): Promise<void> {
        await this.oidb.send(setMemberAdminContract, { groupCode: BigInt(groupUin), targetUid, isAdmin });
    }

    /** 设置群成员专属头衔。 */
    async setMemberSpecialTitle(groupUin: number, targetUid: string, title: string): Promise<void> {
        const specialTitle = Buffer.from(title, 'utf8');
        if (specialTitle.length > 18) {
            throw new DianaError(ErrorCode.Validation, '专属头衔最多 18 字节');
        }
        await this.oidb.send(setMemberTitleContract, {
            groupCode: BigInt(groupUin),
            memLevelInfo: [{ uid: targetUid, specialTitle, specialTitleExpireTime: -1 }],
        });
    }

    /** 处理入群申请/邀请（eventType 1=申请、2=被邀请；filtered 为被过滤请求）。 */
    async handleGroupRequest(
        groupUin: number,
        sequence: number,
        eventType: number,
        accept: boolean,
        reason = '',
        filtered = false,
    ): Promise<void> {
        await this.oidb.send(filtered ? setGroupFilteredRequestContract : setGroupRequestContract, {
            accept: accept ? 1 : 2,
            body: { sequence: BigInt(sequence), eventType, groupUin: BigInt(groupUin), message: reason },
        });
    }
}