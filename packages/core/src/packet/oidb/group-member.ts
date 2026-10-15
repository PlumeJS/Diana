import { ProtoField, ScalarType } from '../../pb/index.js';
import { OidbSvcContract } from './contract.js';

/** 群成员权限。 */
export enum GroupMemberPermission {
    Member = 0,
    Owner = 1,
    Admin = 2,
}

/** 拉取群成员列表。 */
export const fetchGroupMembersContract = new OidbSvcContract(0xfe7, 3, {
    groupUin: ProtoField(1, ScalarType.UINT32),
    field2: ProtoField(2, ScalarType.UINT32),
    field3: ProtoField(3, ScalarType.UINT32),
    queried: ProtoField(
        4,
        () => ({
            memberName: ProtoField(10, ScalarType.BOOL),
            memberCard: ProtoField(11, ScalarType.BOOL),
            level: ProtoField(12, ScalarType.BOOL),
            field13: ProtoField(13, ScalarType.BOOL),
            field16: ProtoField(16, ScalarType.BOOL),
            specialTitle: ProtoField(17, ScalarType.BOOL),
            field18: ProtoField(18, ScalarType.BOOL),
            field20: ProtoField(20, ScalarType.BOOL),
            field21: ProtoField(21, ScalarType.BOOL),
            joinTimestamp: ProtoField(100, ScalarType.BOOL),
            lastMsgTimestamp: ProtoField(101, ScalarType.BOOL),
            shutUpEndTimestamp: ProtoField(102, ScalarType.BOOL),
            field103: ProtoField(103, ScalarType.BOOL),
            field104: ProtoField(104, ScalarType.BOOL),
            field105: ProtoField(105, ScalarType.BOOL),
            field106: ProtoField(106, ScalarType.BOOL),
            permission: ProtoField(107, ScalarType.BOOL),
            field200: ProtoField(200, ScalarType.BOOL),
            field201: ProtoField(201, ScalarType.BOOL),
        }),
        { optional: true },
    ),
    token: ProtoField(15, ScalarType.STRING, { optional: true }),
});

/** 拉取群成员列表响应。 */
export const fetchGroupMembersResponseContract = new OidbSvcContract(0xfe7, 3, {
    groupUin: ProtoField(1, ScalarType.UINT32),
    members: ProtoField(
        2,
        () => ({
            identity: ProtoField(1, () => ({
                uid: ProtoField(2, ScalarType.STRING, { optional: true }),
                uin: ProtoField(4, ScalarType.UINT32),
            })),
            memberName: ProtoField(10, ScalarType.STRING, { optional: true }),
            specialTitle: ProtoField(17, ScalarType.BYTES, { optional: true }),
            memberCard: ProtoField(11, () => ({ value: ProtoField(2, ScalarType.STRING, { optional: true }) }), {
                optional: true,
            }),
            level: ProtoField(
                12,
                () => ({
                    infos: ProtoField(1, ScalarType.UINT32, { repeated: true, packed: true }),
                    level: ProtoField(2, ScalarType.UINT32),
                }),
                { optional: true },
            ),
            joinTimestamp: ProtoField(100, ScalarType.UINT32),
            lastMsgTimestamp: ProtoField(101, ScalarType.UINT32),
            shutUpEndTimestamp: ProtoField(102, ScalarType.UINT32, { optional: true }),
            permission: ProtoField(107, ScalarType.UINT32),
        }),
        { repeated: true },
    ),
    field3: ProtoField(3, ScalarType.UINT32),
    memberChangeSeq: ProtoField(5, ScalarType.UINT32),
    memberCardChangeSeq: ProtoField(6, ScalarType.UINT32),
    token: ProtoField(15, ScalarType.STRING, { optional: true }),
});

/** 禁言/解禁群成员（duration 为 0 表示解禁）。 */
export const muteMemberContract = new OidbSvcContract(0x1253, 1, {
    groupUin: ProtoField(1, ScalarType.UINT32),
    type: ProtoField(2, ScalarType.UINT32),
    body: ProtoField(3, () => ({
        targetUid: ProtoField(1, ScalarType.STRING),
        duration: ProtoField(2, ScalarType.UINT32),
    })),
});

/** 设置群成员名片。 */
export const setMemberCardContract = new OidbSvcContract(0x8fc, 3, {
    groupUin: ProtoField(1, ScalarType.UINT32),
    body: ProtoField(3, () => ({
        targetUid: ProtoField(1, ScalarType.STRING),
        card: ProtoField(8, ScalarType.STRING),
    })),
});

/** 移出群成员。 */
export const kickMemberContract = new OidbSvcContract(0x8a0, 1, {
    groupUin: ProtoField(1, ScalarType.UINT32),
    memberUid: ProtoField(3, ScalarType.STRING),
    rejectSubsequentRequests: ProtoField(4, ScalarType.BOOL),
    reason: ProtoField(5, ScalarType.STRING),
});

/** 设置/取消群管理员（对齐 acidify Oidb.0x1096_1）。 */
export const setMemberAdminContract = new OidbSvcContract(0x1096, 1, {
    groupCode: ProtoField(1, ScalarType.UINT64),
    targetUid: ProtoField(2, ScalarType.STRING),
    isAdmin: ProtoField(3, ScalarType.BOOL),
});

/** 设置群成员专属头衔（对齐 acidify Oidb.0x8fc_2）。 */
export const setMemberTitleContract = new OidbSvcContract(0x8fc, 2, {
    groupCode: ProtoField(1, ScalarType.UINT64),
    memLevelInfo: ProtoField(
        3,
        () => ({
            uid: ProtoField(1, ScalarType.STRING),
            specialTitle: ProtoField(5, ScalarType.BYTES),
            // -1 表示永久头衔
            specialTitleExpireTime: ProtoField(6, ScalarType.INT32),
        }),
        { repeated: true },
    ),
});