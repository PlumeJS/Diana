import { ProtoField, ScalarType } from '../../pb/index.js';
import { OidbSvcContract } from './contract.js';

/** 拉取好友列表。 */
export const fetchFriendsContract = new OidbSvcContract(0xfd4, 1, {
    friendCount: ProtoField(2, ScalarType.UINT32),
    field4: ProtoField(4, ScalarType.UINT32),
    nextUin: ProtoField(5, () => ({ uin: ProtoField(1, ScalarType.UINT32) }), { optional: true }),
    field6: ProtoField(6, ScalarType.UINT32),
    field7: ProtoField(7, ScalarType.UINT32),
    queried: ProtoField(
        10001,
        () => ({
            type: ProtoField(1, ScalarType.UINT32),
            fields: ProtoField(
                2,
                () => ({ numbers: ProtoField(1, ScalarType.UINT32, { repeated: true, packed: true }) }),
                { optional: true },
            ),
        }),
        { repeated: true },
    ),
    field10002: ProtoField(10002, ScalarType.UINT32, { repeated: true, packed: true }),
    field10003: ProtoField(10003, ScalarType.UINT32),
});

/** 拉取好友列表响应。 */
export const fetchFriendsResponseContract = new OidbSvcContract(0xfd4, 1, {
    next: ProtoField(2, () => ({ uin: ProtoField(1, ScalarType.UINT32) }), { optional: true }),
    displayFriendCount: ProtoField(3, ScalarType.UINT32),
    timestamp: ProtoField(6, ScalarType.UINT32),
    selfUin: ProtoField(7, ScalarType.UINT32),
    friends: ProtoField(
        101,
        () => ({
            uid: ProtoField(1, ScalarType.STRING),
            categoryId: ProtoField(2, ScalarType.UINT32),
            uin: ProtoField(3, ScalarType.UINT32),
            additional: ProtoField(
                10001,
                () => ({
                    type: ProtoField(1, ScalarType.UINT32),
                    layer1: ProtoField(
                        2,
                        () => ({
                            numData: ProtoField(
                                1,
                                () => ({
                                    code: ProtoField(1, ScalarType.UINT32),
                                    value: ProtoField(2, ScalarType.UINT32, { optional: true }),
                                }),
                                { repeated: true },
                            ),
                            strData: ProtoField(
                                2,
                                () => ({
                                    code: ProtoField(1, ScalarType.UINT32),
                                    value: ProtoField(2, ScalarType.STRING, { optional: true }),
                                }),
                                { repeated: true },
                            ),
                        }),
                        { optional: true },
                    ),
                }),
                { repeated: true },
            ),
        }),
        { repeated: true },
    ),
    friendCategories: ProtoField(
        102,
        () => ({
            code: ProtoField(1, ScalarType.UINT32),
            value: ProtoField(2, ScalarType.STRING, { optional: true }),
        }),
        { repeated: true },
    ),
});

/** 给好友点赞（field12 固定为 71）。 */
export const sendProfileLikeContract = new OidbSvcContract(0x7e5, 104, {
    targetUid: ProtoField(11, ScalarType.STRING),
    field12: ProtoField(12, ScalarType.UINT32),
    count: ProtoField(13, ScalarType.UINT32),
});

/** 同意/拒绝好友申请（对齐 acidify Oidb.0xb5d_44，accept 3=同意 5=拒绝）。 */
export const setFriendRequestContract = new OidbSvcContract(0xb5d, 44, {
    accept: ProtoField(1, ScalarType.UINT32),
    targetUid: ProtoField(2, ScalarType.STRING),
});