import { MessageType } from '@diana/core';
import type { IncomingMessage, Notification } from '@diana/core';
import { describe, expect, it } from 'vitest';
import { toLifecycleEvent, toMessageEvent, toNoticeEvent, toRequestEvent } from '../../src/event/convert.js';

const groupMessage: IncomingMessage = {
    type: MessageType.GroupMessage,
    time: 1700000000,
    senderUin: 20001,
    targetUin: 10000,
    senderUid: 'u_sender',
    senderName: 'Alice',
    groupUin: 888,
    sequence: 42,
    segments: [
        { type: 'mention', uin: 10000, name: '@Bot' },
        { type: 'text', content: ' hi' },
        { type: 'face', id: 14 },
    ],
};

/** 测试用 uid→uin 解析器。 */
const resolveUin = async (uid: string): Promise<number> => {
    const known: Record<string, number> = { u_a: 30001, u_op: 20002, u_f: 20001 };
    return known[uid] ?? 0;
};

describe('事件转换', () => {
    it('群消息事件', async () => {
        const event = await toMessageEvent(groupMessage, 10000);
        expect(event).toMatchObject({
            post_type: 'message',
            message_type: 'group',
            sub_type: 'normal',
            message_id: 42,
            user_id: 20001,
            group_id: 888,
            font: 0,
            self_id: 10000,
            time: 1700000000,
        });
        expect(event.raw_message).toBe('[CQ:at,qq=10000] hi[CQ:face,id=14]');
        expect(event.sender).toEqual({ user_id: 20001, nickname: 'Alice' });
        expect(event.message).toEqual([
            { type: 'at', data: { qq: '10000' } },
            { type: 'text', data: { text: ' hi' } },
            { type: 'face', data: { id: '14' } },
        ]);
    });

    it('私聊消息事件', async () => {
        const event = await toMessageEvent(
            { ...groupMessage, type: MessageType.PrivateMessage, groupUin: undefined, segments: [{ type: 'text', content: 'hi' }] },
            10000,
        );
        expect(event).toMatchObject({ message_type: 'private', sub_type: 'friend', group_id: undefined });
        expect(event.raw_message).toBe('hi');
    });

    it('入站合并转发映射为 forward 段', async () => {
        const event = await toMessageEvent({ ...groupMessage, segments: [{ type: 'forward', resId: 'res-9' }] }, 10000);
        expect(event.message).toEqual([{ type: 'forward', data: { id: 'res-9' } }]);
        expect(event.raw_message).toBe('[CQ:forward,id=res-9]');
    });

    it('好友请求事件', () => {
        const notification: Notification = { type: 'friendRequest', fromUin: 20001, fromUid: 'u_f', message: 'hi', via: 'search' };
        expect(toRequestEvent(notification, 10000)).toMatchObject({
            post_type: 'request',
            request_type: 'friend',
            user_id: 20001,
            comment: 'hi',
            flag: 'u_f',
        });
    });

    it('群加入请求事件', () => {
        const notification: Notification = { type: 'groupJoinRequest', groupUin: 888, memberUid: 'u_m' };
        expect(toRequestEvent(notification, 10000)).toMatchObject({
            post_type: 'request',
            request_type: 'group',
            sub_type: 'add',
            group_id: 888,
            flag: 'u_m',
        });
    });

    it('群撤回通知事件', async () => {
        const notification: Notification = {
            type: 'groupRecall',
            groupUin: 888,
            operatorUid: 'u_op',
            tip: '',
            messages: [{ sequence: 7, authorUid: 'u_a' }],
        };
        expect(await toNoticeEvent(notification, 10000, resolveUin)).toMatchObject({
            post_type: 'notice',
            notice_type: 'group_recall',
            group_id: 888,
            user_id: 30001,
            operator_id: 20002,
            message_id: 7,
        });
    });

    it('群成员增减通知事件按 changeType 推导 sub_type', async () => {
        expect(
            await toNoticeEvent(
                { type: 'groupMemberIncrease', groupUin: 888, memberUid: 'u_a', changeType: 131, operatorUid: 'u_op' },
                10000,
                resolveUin,
            ),
        ).toMatchObject({ notice_type: 'group_increase', sub_type: 'invite', user_id: 30001, operator_id: 20002 });
        expect(
            await toNoticeEvent(
                { type: 'groupMemberDecrease', groupUin: 888, memberUid: 'u_a', changeType: 3 },
                10000,
                resolveUin,
            ),
        ).toMatchObject({ notice_type: 'group_decrease', sub_type: 'kick_me', user_id: 30001, operator_id: 0 });
        expect(
            await toNoticeEvent(
                { type: 'groupMemberDecrease', groupUin: 888, memberUid: 'u_a', changeType: 130 },
                10000,
                resolveUin,
            ),
        ).toMatchObject({ notice_type: 'group_decrease', sub_type: 'leave' });
    });

    it('群禁言通知事件', async () => {
        const notification: Notification = {
            type: 'groupMute',
            groupUin: 888,
            operatorUid: 'u_op',
            duration: 60,
            all: false,
        };
        expect(await toNoticeEvent(notification, 10000, resolveUin)).toMatchObject({
            post_type: 'notice',
            notice_type: 'group_ban',
            sub_type: 'ban',
            group_id: 888,
            operator_id: 20002,
            duration: 60,
        });
    });

    it('戳一戳通知事件', async () => {
        const friendNotification: Notification = {
            type: 'friendPoke',
            operatorUin: 20001,
            targetUin: 10000,
            action: '戳了戳',
            actionImgUrl: 'http://x/a.png',
        };
        expect(await toNoticeEvent(friendNotification, 10000, resolveUin)).toMatchObject({
            post_type: 'notice',
            notice_type: 'notify',
            sub_type: 'poke',
            user_id: 20001,
            target_id: 10000,
        });

        const groupNotification: Notification = {
            type: 'groupPoke',
            groupUin: 888,
            operatorUin: 20001,
            targetUin: 10000,
            action: '拍了拍',
            actionImgUrl: 'http://x/a.png',
        };
        expect(await toNoticeEvent(groupNotification, 10000, resolveUin)).toMatchObject({
            post_type: 'notice',
            notice_type: 'notify',
            sub_type: 'poke',
            group_id: 888,
            user_id: 20001,
            target_id: 10000,
        });
    });

    it('群精华/群名/表情回应通知事件', async () => {
        expect(
            await toNoticeEvent(
                { type: 'groupEssenceMessageChange', groupUin: 888, msgSequence: 5, memberUin: 30001, operatorUin: 20002, add: true },
                10000,
                resolveUin,
            ),
        ).toMatchObject({
            post_type: 'notice',
            notice_type: 'essence',
            sub_type: 'add',
            group_id: 888,
            message_id: 5,
            operator_id: 20002,
            sender_id: 30001,
        });
        expect(
            await toNoticeEvent({ type: 'groupNameChange', groupUin: 888, name: 'NewName', operatorUid: 'u_op' }, 10000, resolveUin),
        ).toMatchObject({ notice_type: 'group_name_change', group_id: 888, operator_id: 20002, name: 'NewName' });
        expect(
            await toNoticeEvent(
                { type: 'groupReaction', groupUin: 888, sequence: 9, operatorUid: 'u_op', code: '1', count: 3, isAdd: true },
                10000,
                resolveUin,
            ),
        ).toMatchObject({
            notice_type: 'group_reaction',
            sub_type: 'add',
            group_id: 888,
            message_id: 9,
            operator_id: 20002,
            code: '1',
            count: 3,
        });
    });

    it('生命周期元事件', () => {
        expect(toLifecycleEvent(10000)).toMatchObject({
            post_type: 'meta_event',
            meta_event_type: 'lifecycle',
            sub_type: 'connect',
            self_id: 10000,
        });
    });
});
