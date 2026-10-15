import { ProtoField, ProtoMessage, ScalarType } from '../../pb/index.js';
import { bytesField, scalarField } from '../../tlv/index.js';

/** 群成员增加类型。 */
export enum IncreaseType {
    Approve = 130,
    Invite = 131,
}

/** 群成员减少类型。 */
export enum DecreaseType {
    KickSelf = 3,
    Exit = 130,
    Kick = 131,
}

/** 群成员变动。 */
export const GroupMemberChange = ProtoMessage.of({
    groupUin: ProtoField(1, ScalarType.UINT32),
    memberUid: ProtoField(3, ScalarType.STRING),
    type: ProtoField(4, ScalarType.UINT32),
    operatorInfo: ProtoField(5, ScalarType.BYTES, { optional: true }),
});

/** 操作者信息。 */
export const OperatorInfo = ProtoMessage.of({
    body: ProtoField(1, () => ({ uid: ProtoField(1, ScalarType.STRING) })),
});

/** 群加入请求。 */
export const GroupJoinRequest = ProtoMessage.of({
    groupUin: ProtoField(1, ScalarType.UINT32),
    memberUid: ProtoField(3, ScalarType.STRING),
});

/** 群被邀请加入请求。 */
export const GroupInvitationRequest = ProtoMessage.of({
    command: ProtoField(1, ScalarType.INT32),
    info: ProtoField(2, () => ({
        inner: ProtoField(1, () => ({
            groupUin: ProtoField(1, ScalarType.UINT32),
            targetUid: ProtoField(5, ScalarType.STRING),
            invitorUid: ProtoField(6, ScalarType.STRING),
        })),
    })),
});

/** 被邀请入群。 */
export const GroupInvitation = ProtoMessage.of({
    groupUin: ProtoField(1, ScalarType.UINT32),
    invitorUid: ProtoField(5, ScalarType.STRING),
});

/** 管理员变更。 */
export const GroupAdminChange = ProtoMessage.of({
    groupUin: ProtoField(1, ScalarType.UINT32),
    body: ProtoField(4, () => ({
        unset: ProtoField(1, () => ({ targetUid: ProtoField(1, ScalarType.STRING) }), { optional: true }),
        set: ProtoField(2, () => ({ targetUid: ProtoField(1, ScalarType.STRING) }), { optional: true }),
    })),
});

/** 群禁言。 */
export const GroupMute = ProtoMessage.of({
    groupUin: ProtoField(1, ScalarType.UINT32),
    operatorUid: ProtoField(4, ScalarType.STRING),
    info: ProtoField(5, () => ({
        timestamp: ProtoField(1, ScalarType.UINT32),
        state: ProtoField(3, () => ({
            targetUid: ProtoField(1, ScalarType.STRING, { optional: true }),
            duration: ProtoField(2, ScalarType.UINT32),
        })),
    })),
});

/** 群消息撤回。 */
export const GroupRecall = ProtoMessage.of({
    operatorUid: ProtoField(1, ScalarType.STRING),
    recallMessages: ProtoField(
        3,
        () => ({
            sequence: ProtoField(1, ScalarType.UINT32),
            time: ProtoField(2, ScalarType.UINT32),
            random: ProtoField(3, ScalarType.UINT32),
            type: ProtoField(4, ScalarType.UINT32),
            flag: ProtoField(5, ScalarType.UINT32),
            authorUid: ProtoField(6, ScalarType.STRING),
        }),
        { repeated: true },
    ),
    tipInfo: ProtoField(9, () => ({ tip: ProtoField(2, ScalarType.STRING, { optional: true }) }), { optional: true }),
});

/** 群精华消息变更标记。 */
export enum GroupEssenceMessageChangeSetFlag {
    Add = 1,
    Remove = 2,
}

/** 群精华消息变更。 */
export const GroupEssenceMessageChange = ProtoMessage.of({
    groupUin: ProtoField(1, ScalarType.UINT32),
    msgSequence: ProtoField(2, ScalarType.UINT32),
    random: ProtoField(3, ScalarType.UINT32),
    setFlag: ProtoField(4, ScalarType.UINT32),
    memberUin: ProtoField(5, ScalarType.UINT32),
    operatorUin: ProtoField(6, ScalarType.UINT32),
});

/** 群名称变更。 */
export const GroupNameChange = ProtoMessage.of({
    name: ProtoField(2, ScalarType.STRING),
});

/** 群表情回应。 */
export const GroupReaction = ProtoMessage.of({
    data: ProtoField(1, () => ({
        data: ProtoField(1, () => ({
            target: ProtoField(2, () => ({ sequence: ProtoField(1, ScalarType.UINT32) })),
            data: ProtoField(3, () => ({
                code: ProtoField(1, ScalarType.STRING),
                reactionType: ProtoField(2, ScalarType.UINT32),
                count: ProtoField(3, ScalarType.UINT32),
                operatorUid: ProtoField(4, ScalarType.STRING),
                type: ProtoField(5, ScalarType.UINT32),
            })),
        })),
    })),
});

/** 通用灰条提示。 */
export const GeneralGrayTip = ProtoMessage.of({
    bizType: ProtoField(1, ScalarType.UINT32),
    templateParams: ProtoField(
        7,
        () => ({
            key: ProtoField(1, ScalarType.STRING),
            value: ProtoField(2, ScalarType.STRING),
        }),
        { repeated: true },
    ),
});

/** `0x2DC` 群事件外层（TLV）。 */
export const groupGeneral0x2dcSchema = [
    scalarField('groupUin', 'uint32'),
    scalarField('unknownByte', 'uint8'),
    bytesField('body', 'uint16'),
];

/** `0x2DC` 群事件体。 */
export const GroupGeneral0x2DCBody = ProtoMessage.of({
    type: ProtoField(1, ScalarType.UINT32),
    groupUin: ProtoField(4, ScalarType.UINT32),
    eventParam: ProtoField(5, ScalarType.BYTES, { optional: true }),
    recall: ProtoField(11, () => GroupRecall.fields, { optional: true }),
    field13: ProtoField(13, ScalarType.UINT32, { optional: true }),
    operatorUid: ProtoField(21, ScalarType.STRING, { optional: true }),
    generalGrayTip: ProtoField(26, () => GeneralGrayTip.fields, { optional: true }),
    essenceMessageChange: ProtoField(33, () => GroupEssenceMessageChange.fields, { optional: true }),
    msgSequence: ProtoField(37, ScalarType.UINT32),
    reaction: ProtoField(44, () => GroupReaction.fields, { optional: true }),
});

/** 好友请求。 */
export const FriendRequest = ProtoMessage.of({
    body: ProtoField(1, () => ({
        fromUid: ProtoField(2, ScalarType.STRING),
        message: ProtoField(10, ScalarType.STRING),
        via: ProtoField(11, ScalarType.STRING, { optional: true }),
    })),
});

/** 好友请求来源（补充字段）。 */
export const FriendRequestExtractVia = ProtoMessage.of({
    body: ProtoField(1, () => ({ via: ProtoField(5, ScalarType.STRING) })),
});

/** 好友消息撤回。 */
export const FriendRecall = ProtoMessage.of({
    body: ProtoField(1, () => ({
        fromUid: ProtoField(1, ScalarType.STRING),
        toUid: ProtoField(2, ScalarType.STRING),
        clientSequence: ProtoField(3, ScalarType.UINT32),
        tipInfo: ProtoField(13, () => ({ tip: ProtoField(2, ScalarType.STRING) })),
        sequence: ProtoField(20, ScalarType.UINT32),
    })),
});