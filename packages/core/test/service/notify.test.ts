import { describe, expect, it } from 'vitest';
import {
    Event0x210SubType,
    Event0x2DCSubType,
    Event0x2DCSubType16Field13,
    FriendRecall,
    FriendRequest,
    GeneralGrayTip,
    GroupAdminChange,
    groupGeneral0x2dcSchema,
    GroupGeneral0x2DCBody,
    GroupInvitation,
    GroupJoinRequest,
    GroupMemberChange,
    GroupMute,
    GroupNameChange,
    IncreaseType,
    OperatorInfo,
    PushMsg,
    PushMsgBody,
    PushMsgType,
} from '../../src/packet/message/index.js';
import { parseNotification } from '../../src/service/index.js';
import { encodeTlv } from '../../src/tlv/index.js';

function push(type: number, subType: number, msgContent: Buffer, fromUin = 10000): Buffer {
    const message = PushMsgBody.encode({
        responseHead: { fromUin, type, toUin: 0 },
        contentHead: { type, subType, timestamp: 0 },
        body: { msgContent },
    });
    return PushMsg.encode({ message });
}

function group2dc(body: Buffer, groupUin = 888): Buffer {
    return encodeTlv(groupGeneral0x2dcSchema, { groupUin, unknownByte: 0, body });
}

function grayTip(bizType: number, params: Record<string, string>): Buffer {
    return GeneralGrayTip.encode({
        bizType,
        templateParams: Object.entries(params).map(([key, value]) => ({ key, value })),
    });
}

describe('通知事件解析', () => {
    it('好友请求', () => {
        const content = FriendRequest.encode({ body: { fromUid: 'u_f', message: 'hi', via: 'search' } });
        expect(parseNotification(push(PushMsgType.Event0x210, Event0x210SubType.FriendRequest, content, 20001))).toEqual({
            type: 'friendRequest',
            fromUin: 20001,
            fromUid: 'u_f',
            message: 'hi',
            via: 'search',
        });
    });

    it('好友撤回', () => {
        const content = FriendRecall.encode({
            body: { fromUid: 'u_a', toUid: 'u_b', clientSequence: 1, tipInfo: { tip: 'recalled' }, sequence: 42 },
        });
        expect(parseNotification(push(PushMsgType.Event0x210, Event0x210SubType.FriendRecall, content))).toEqual({
            type: 'friendRecall',
            fromUid: 'u_a',
            toUid: 'u_b',
            sequence: 42,
            tip: 'recalled',
        });
    });

    it('好友戳一戳', () => {
        const content = grayTip(12, {
            uin_str1: '20001',
            uin_str2: '10000',
            action_str: '戳了戳',
            action_img_url: 'http://x/a.png',
            suffix_str: '脸',
        });
        expect(parseNotification(push(PushMsgType.Event0x210, Event0x210SubType.FriendGrayTip, content, 20001))).toEqual({
            type: 'friendPoke',
            operatorUin: 20001,
            targetUin: 10000,
            action: '戳了戳',
            actionImgUrl: 'http://x/a.png',
            suffix: '脸',
        });
    });

    it('群戳一戳', () => {
        const wrapper = GroupGeneral0x2DCBody.encode({
            type: 0,
            groupUin: 888,
            generalGrayTip: {
                bizType: 12,
                templateParams: [
                    { key: 'uin_str1', value: '20001' },
                    { key: 'uin_str2', value: '10000' },
                    { key: 'alt_str1', value: '拍了拍' },
                    { key: 'action_img_url', value: 'http://x/a.png' },
                ],
            },
            msgSequence: 0,
        });
        expect(parseNotification(push(PushMsgType.Event0x2DC, Event0x2DCSubType.GroupGrayTip, group2dc(wrapper)))).toEqual({
            type: 'groupPoke',
            groupUin: 888,
            operatorUin: 20001,
            targetUin: 10000,
            action: '拍了拍',
            actionImgUrl: 'http://x/a.png',
        });
    });

    it('群成员增加', () => {
        const content = GroupMemberChange.encode({
            groupUin: 888,
            memberUid: 'u_m',
            type: IncreaseType.Approve,
            operatorInfo: OperatorInfo.encode({ body: { uid: 'u_op' } }),
        });
        expect(parseNotification(push(PushMsgType.GroupMemberIncrease, 0, content))).toEqual({
            type: 'groupMemberIncrease',
            groupUin: 888,
            memberUid: 'u_m',
            changeType: 130,
            operatorUid: 'u_op',
        });
    });

    it('群成员减少', () => {
        const content = GroupMemberChange.encode({ groupUin: 888, memberUid: 'u_m', type: 131 });
        expect(parseNotification(push(PushMsgType.GroupMemberDecrease, 0, content))).toEqual({
            type: 'groupMemberDecrease',
            groupUin: 888,
            memberUid: 'u_m',
            changeType: 131,
            operatorUid: undefined,
        });
    });

    it('群加入请求', () => {
        const content = GroupJoinRequest.encode({ groupUin: 888, memberUid: 'u_m' });
        expect(parseNotification(push(PushMsgType.GroupJoinRequest, 0, content))).toEqual({
            type: 'groupJoinRequest',
            groupUin: 888,
            memberUid: 'u_m',
        });
    });

    it('被邀请入群', () => {
        const content = GroupInvitation.encode({ groupUin: 888, invitorUid: 'u_inv' });
        expect(parseNotification(push(PushMsgType.GroupInvitation, 0, content))).toEqual({
            type: 'groupInvitation',
            groupUin: 888,
            invitorUid: 'u_inv',
        });
    });

    it('管理员变更', () => {
        const setContent = GroupAdminChange.encode({ groupUin: 888, body: { set: { targetUid: 'u_t' } } });
        expect(parseNotification(push(PushMsgType.GroupAdminChange, 0, setContent))).toEqual({
            type: 'groupAdminChange',
            groupUin: 888,
            targetUid: 'u_t',
            set: true,
        });
        const unsetContent = GroupAdminChange.encode({ groupUin: 888, body: { unset: { targetUid: 'u_t' } } });
        expect(parseNotification(push(PushMsgType.GroupAdminChange, 0, unsetContent))).toMatchObject({ set: false });
    });

    it('群成员禁言', () => {
        const content = GroupMute.encode({
            groupUin: 888,
            operatorUid: 'u_op',
            info: { timestamp: 0, state: { targetUid: 'u_t', duration: 60 } },
        });
        expect(parseNotification(push(PushMsgType.Event0x2DC, Event0x2DCSubType.GroupMute, content))).toEqual({
            type: 'groupMute',
            groupUin: 888,
            operatorUid: 'u_op',
            targetUid: 'u_t',
            duration: 60,
            all: false,
        });
    });

    it('全员禁言', () => {
        const content = GroupMute.encode({ groupUin: 888, operatorUid: 'u_op', info: { timestamp: 0, state: { duration: 0 } } });
        expect(parseNotification(push(PushMsgType.Event0x2DC, Event0x2DCSubType.GroupMute, content))).toMatchObject({
            type: 'groupMute',
            all: true,
        });
    });

    it('群消息撤回', () => {
        const wrapper = GroupGeneral0x2DCBody.encode({
            type: 0,
            groupUin: 888,
            recall: { operatorUid: 'u_op', recallMessages: [{ sequence: 1, authorUid: 'u_a' }], tipInfo: { tip: 'recalled' } },
            msgSequence: 0,
        });
        expect(parseNotification(push(PushMsgType.Event0x2DC, Event0x2DCSubType.GroupRecall, group2dc(wrapper)))).toEqual({
            type: 'groupRecall',
            groupUin: 888,
            operatorUid: 'u_op',
            tip: 'recalled',
            messages: [{ sequence: 1, authorUid: 'u_a' }],
        });
    });

    it('群名称变更', () => {
        const wrapper = GroupGeneral0x2DCBody.encode({
            type: 0,
            groupUin: 888,
            field13: Event0x2DCSubType16Field13.GroupNameChange,
            operatorUid: 'u_op',
            eventParam: GroupNameChange.encode({ name: 'NewName' }),
            msgSequence: 0,
        });
        expect(parseNotification(push(PushMsgType.Event0x2DC, Event0x2DCSubType.SubType16, group2dc(wrapper)))).toEqual({
            type: 'groupNameChange',
            groupUin: 888,
            name: 'NewName',
            operatorUid: 'u_op',
        });
    });

    it('群精华消息变更', () => {
        const wrapper = GroupGeneral0x2DCBody.encode({
            type: 0,
            groupUin: 888,
            essenceMessageChange: { groupUin: 888, msgSequence: 5, random: 0, setFlag: 1, memberUin: 0, operatorUin: 10000 },
            msgSequence: 0,
        });
        expect(
            parseNotification(push(PushMsgType.Event0x2DC, Event0x2DCSubType.GroupEssenceMessageChange, group2dc(wrapper))),
        ).toEqual({ type: 'groupEssenceMessageChange', groupUin: 888, msgSequence: 5, memberUin: 0, operatorUin: 10000, add: true });
    });

    it('群表情回应', () => {
        const wrapper = GroupGeneral0x2DCBody.encode({
            type: 0,
            groupUin: 888,
            field13: Event0x2DCSubType16Field13.GroupReaction,
            reaction: { data: { data: { target: { sequence: 9 }, data: { code: '1', reactionType: 2, count: 3, operatorUid: 'u_op', type: 1 } } } },
            msgSequence: 0,
        });
        expect(parseNotification(push(PushMsgType.Event0x2DC, Event0x2DCSubType.SubType16, group2dc(wrapper)))).toEqual({
            type: 'groupReaction',
            groupUin: 888,
            sequence: 9,
            operatorUid: 'u_op',
            code: '1',
            reactionType: 2,
            count: 3,
            isAdd: true,
        });
    });

    it('未建模的 0x2DC 子类型不做解包，返回 undefined', () => {
        // 该内容按 `groupUin(4)+1字节+长度(2)+proto` 错位解包时会命中非法线类型 7
        const content = Buffer.from([0x00, 0x00, 0x03, 0x78, 0x00, 0x00, 0x02, 0x3f, 0x00]);
        expect(parseNotification(push(PushMsgType.Event0x2DC, 99, content))).toBeUndefined();
    });

    it('非通知推送返回 undefined', () => {
        expect(parseNotification(push(PushMsgType.PrivateMessage, 0, Buffer.alloc(0)))).toBeUndefined();
    });
});
