import { ProtoField, ScalarType } from '../../pb/index.js';
import { OidbSvcContract } from './contract.js';

/** 拉取群列表。 */
export const fetchGroupsContract = new OidbSvcContract(0xfe5, 2, {
    config: ProtoField(
        1,
        () => ({
            config1: ProtoField(
                1,
                () => ({
                    groupOwner: ProtoField(1, ScalarType.BOOL),
                    field2: ProtoField(2, ScalarType.BOOL),
                    memberMax: ProtoField(3, ScalarType.BOOL),
                    memberCount: ProtoField(4, ScalarType.BOOL),
                    groupName: ProtoField(5, ScalarType.BOOL),
                    field8: ProtoField(8, ScalarType.BOOL),
                    field9: ProtoField(9, ScalarType.BOOL),
                    field10: ProtoField(10, ScalarType.BOOL),
                    field11: ProtoField(11, ScalarType.BOOL),
                    field12: ProtoField(12, ScalarType.BOOL),
                    field13: ProtoField(13, ScalarType.BOOL),
                    field14: ProtoField(14, ScalarType.BOOL),
                    field15: ProtoField(15, ScalarType.BOOL),
                    field16: ProtoField(16, ScalarType.BOOL),
                    field17: ProtoField(17, ScalarType.BOOL),
                    field18: ProtoField(18, ScalarType.BOOL),
                    question: ProtoField(19, ScalarType.BOOL),
                    field20: ProtoField(20, ScalarType.BOOL),
                    field22: ProtoField(22, ScalarType.BOOL),
                    field23: ProtoField(23, ScalarType.BOOL),
                    field24: ProtoField(24, ScalarType.BOOL),
                    field25: ProtoField(25, ScalarType.BOOL),
                    field26: ProtoField(26, ScalarType.BOOL),
                    field27: ProtoField(27, ScalarType.BOOL),
                    field28: ProtoField(28, ScalarType.BOOL),
                    field29: ProtoField(29, ScalarType.BOOL),
                    field30: ProtoField(30, ScalarType.BOOL),
                    field31: ProtoField(31, ScalarType.BOOL),
                    field32: ProtoField(32, ScalarType.BOOL),
                    field5001: ProtoField(5001, ScalarType.BOOL),
                    field5002: ProtoField(5002, ScalarType.BOOL),
                    field5003: ProtoField(5003, ScalarType.BOOL),
                }),
                { optional: true },
            ),
            config2: ProtoField(
                2,
                () => ({
                    field1: ProtoField(1, ScalarType.BOOL),
                    field2: ProtoField(2, ScalarType.BOOL),
                    field3: ProtoField(3, ScalarType.BOOL),
                    field4: ProtoField(4, ScalarType.BOOL),
                    field5: ProtoField(5, ScalarType.BOOL),
                    field6: ProtoField(6, ScalarType.BOOL),
                    field7: ProtoField(7, ScalarType.BOOL),
                    field8: ProtoField(8, ScalarType.BOOL),
                }),
                { optional: true },
            ),
            config3: ProtoField(
                3,
                () => ({
                    field5: ProtoField(5, ScalarType.BOOL),
                    field6: ProtoField(6, ScalarType.BOOL),
                }),
                { optional: true },
            ),
        }),
        { optional: true },
    ),
});

/** 拉取群列表响应。 */
export const fetchGroupsResponseContract = new OidbSvcContract(0xfe5, 2, {
    groups: ProtoField(
        2,
        () => ({
            groupUin: ProtoField(3, ScalarType.UINT32),
            info: ProtoField(
                4,
                () => ({
                    groupOwner: ProtoField(1, () => ({ uid: ProtoField(2, ScalarType.STRING, { optional: true }) }), {
                        optional: true,
                    }),
                    createdTime: ProtoField(2, ScalarType.UINT32),
                    memberMax: ProtoField(3, ScalarType.UINT32),
                    memberCount: ProtoField(4, ScalarType.UINT32),
                    groupName: ProtoField(5, ScalarType.STRING, { optional: true }),
                    description: ProtoField(18, ScalarType.STRING, { optional: true }),
                    question: ProtoField(19, ScalarType.STRING, { optional: true }),
                    announcement: ProtoField(30, ScalarType.STRING, { optional: true }),
                }),
                { optional: true },
            ),
        }),
        { repeated: true },
    ),
});

/** 全员禁言/解禁（duration 为 1 表示开启，0 表示关闭）。 */
export const muteAllMembersContract = new OidbSvcContract(0x89a, 0, {
    groupUin: ProtoField(1, ScalarType.UINT32),
    body: ProtoField(2, () => ({
        duration: ProtoField(17, ScalarType.UINT32, { optional: true }),
    })),
});

/** 设置群名称。 */
export const setGroupNameContract = new OidbSvcContract(0x89a, 15, {
    groupUin: ProtoField(1, ScalarType.UINT32),
    body: ProtoField(2, () => ({
        name: ProtoField(3, ScalarType.STRING),
    })),
});

/** 主动退群/解散群（对齐 acidify Oidb.0x1097_1）。 */
export const quitGroupContract = new OidbSvcContract(0x1097, 1, {
    groupCode: ProtoField(1, ScalarType.UINT64),
});

/** 处理入群申请/邀请的请求体（对齐 acidify Oidb.0x10c8）。 */
const setGroupRequestFields = {
    accept: ProtoField(1, ScalarType.UINT32),
    body: ProtoField(2, () => ({
        sequence: ProtoField(1, ScalarType.UINT64),
        // 1=入群申请，2=他人邀请我入群，22=处理邀请他人入群
        eventType: ProtoField(2, ScalarType.UINT32),
        groupUin: ProtoField(3, ScalarType.UINT64),
        message: ProtoField(4, ScalarType.STRING),
    })),
};

/** 同意/拒绝入群申请与邀请。 */
export const setGroupRequestContract = new OidbSvcContract(0x10c8, 1, setGroupRequestFields);

/** 同意/拒绝被过滤（风险账号）的入群请求。 */
export const setGroupFilteredRequestContract = new OidbSvcContract(0x10c8, 2, setGroupRequestFields);

/** 拉取群扩展信息（含最新消息序列号）。 */
export const fetchGroupExtraInfoContract = new OidbSvcContract(0x88d, 0, {
    random: ProtoField(1, ScalarType.UINT32),
    config: ProtoField(2, () => ({
        groupUin: ProtoField(1, ScalarType.UINT64),
        flags: ProtoField(2, () => ({
            latestMessageSeq: ProtoField(22, ScalarType.BOOL),
        })),
    })),
});

/** 拉取群扩展信息响应。 */
export const fetchGroupExtraInfoResponseContract = new OidbSvcContract(0x88d, 0, {
    info: ProtoField(1, () => ({
        groupUin: ProtoField(1, ScalarType.UINT64),
        results: ProtoField(3, () => ({
            latestMessageSeq: ProtoField(22, ScalarType.UINT64),
        })),
    })),
});