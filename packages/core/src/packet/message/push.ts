import { ProtoField, ProtoMessage, ScalarType } from '../../pb/index.js';
import { ContentHead } from './content-head.js';
import { MessageBody } from './message-body.js';

/** 推送消息类型。 */
export enum PushMsgType {
    PrivateMessage = 166,
    GroupMessage = 82,
    TempMessage = 141,

    PrivateRecordMessage = 208,
    PrivateFileMessage = 529,

    Event0x210 = 528,
    Event0x2DC = 732,

    GroupInvitedJoinRequest = 525,
    GroupJoinRequest = 84,
    GroupInvitation = 87,
    GroupAdminChange = 44,
    GroupMemberIncrease = 33,
    GroupMemberDecrease = 34,
}

/** `0x210` 好友事件子类型。 */
export enum Event0x210SubType {
    FriendRequest = 35,
    GroupMemberEnter = 38,
    FriendDeleteOrPinChanged = 39,
    FriendRecall = 138,
    FriendSelfRecall = 139,
    ServicePinChange = 199,
    FriendGrayTip = 290,
    GroupKick = 212,
}

/** `0x2DC` 群事件子类型。 */
export enum Event0x2DCSubType {
    GroupMute = 12,
    SubType16 = 16,
    GroupRecall = 17,
    GroupGrayTip = 20,
    GroupEssenceMessageChange = 21,
}

/** `0x2DC` 子类型 16 的字段 13 取值。 */
export enum Event0x2DCSubType16Field13 {
    GroupMemberSpecialTitle = 6,
    GroupNameChange = 12,
    GroupTodo = 23,
    GroupReaction = 35,
}

/** 推送外层。 */
export const PushMsg = ProtoMessage.of({
    message: ProtoField(1, ScalarType.BYTES),
    status: ProtoField(3, ScalarType.INT32, { optional: true }),
    pingFlag: ProtoField(5, ScalarType.INT32, { optional: true }),
    generalFlag: ProtoField(9, ScalarType.INT32, { optional: true }),
});

/** 推送消息体。 */
export const PushMsgBody = ProtoMessage.of({
    responseHead: ProtoField(1, () => ({
        fromUin: ProtoField(1, ScalarType.UINT32),
        fromUid: ProtoField(2, ScalarType.STRING, { optional: true }),
        type: ProtoField(3, ScalarType.UINT32),
        toUin: ProtoField(5, ScalarType.UINT32),
        toUid: ProtoField(6, ScalarType.STRING, { optional: true }),
        friendExt: ProtoField(
            7,
            () => ({ friendName: ProtoField(6, ScalarType.STRING, { optional: true }) }),
            { optional: true },
        ),
        groupExt: ProtoField(
            8,
            () => ({
                groupUin: ProtoField(1, ScalarType.UINT32),
                memberName: ProtoField(4, ScalarType.STRING),
                groupName: ProtoField(7, ScalarType.STRING),
            }),
            { optional: true },
        ),
    })),
    contentHead: ProtoField(2, () => ContentHead.fields),
    body: ProtoField(3, () => MessageBody.fields, { optional: true }),
});