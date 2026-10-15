import { DecreaseType, IncreaseType, MessageType } from '@diana/core';
import type { IncomingMessage, IncomingSegment, Notification } from '@diana/core';
import type { Segment } from '../message/segment.js';
import type {
    HeartbeatMetaEvent,
    LifecycleMetaEvent,
    MessageEvent,
    NoticeEvent,
    RequestEvent,
} from './types.js';

/** 媒体下载 URL 解析器（对齐 acidify：解析到媒体段时现场调 oidb 200 换取带新鲜 rkey 的 URL）。 */
export type ResolveMediaUrl = (segment: IncomingSegment) => Promise<string | undefined>;

/** 将入站消息段转换为 OneBot 消息段。 */
export async function toSegment(segment: IncomingSegment, resolveUrl?: ResolveMediaUrl): Promise<Segment> {
    switch (segment.type) {
        case 'text':
            return { type: 'text', data: { text: segment.content } };
        case 'mention':
            return { type: 'at', data: { qq: String(segment.uin) } };
        case 'face':
            return { type: 'face', data: { id: String(segment.id) } };
        case 'image':
            return { type: 'image', data: { file: segment.url ?? (await resolveUrl?.(segment)) ?? '' } };
        case 'record':
            return { type: 'record', data: { file: (await resolveUrl?.(segment)) ?? '' } };
        case 'lightApp':
            return { type: 'json', data: { data: segment.payload } };
        case 'forward':
            return { type: 'forward', data: { id: segment.resId } };
        case 'video':
            return { type: 'video', data: { file: (await resolveUrl?.(segment)) ?? '' } };
    }
}

function toCq(segment: Segment): string {
    switch (segment.type) {
        case 'text':
            return segment.data.text;
        case 'at':
            return `[CQ:at,qq=${segment.data.qq}]`;
        case 'face':
            return `[CQ:face,id=${segment.data.id}]`;
        case 'image':
            return `[CQ:image,file=${segment.data.file}]`;
        case 'record':
            return `[CQ:record,file=${segment.data.file}]`;
        case 'forward':
            return `[CQ:forward,id=${segment.data.id}]`;
        default:
            return `[CQ:${segment.type}]`;
    }
}

/** `get_msg` / 历史消息返回的消息数据。 */
export interface MessageData {
    message_id: number;
    real_id: number;
    user_id: number;
    group_id?: number;
    time: number;
    message: Segment[];
    raw_message: string;
    sender: { user_id: number; nickname: string; card?: string; role?: string };
}

/** 将入站消息转换为 OneBot 消息数据（`get_msg` / 历史消息共用）。 */
export async function toMessageData(
    message: IncomingMessage,
    resolveUrl?: ResolveMediaUrl,
): Promise<MessageData> {
    const isGroup = message.type === MessageType.GroupMessage;
    const segments = await Promise.all(message.segments.map((segment) => toSegment(segment, resolveUrl)));
    return {
        message_id: message.sequence,
        real_id: message.sequence,
        user_id: message.senderUin,
        ...(isGroup ? { group_id: message.groupUin } : {}),
        time: message.time,
        message: segments,
        raw_message: segments.map(toCq).join(''),
        sender: { user_id: message.senderUin, nickname: message.senderName },
    };
}

/** 将入站消息转换为 OneBot 消息事件。 */
export async function toMessageEvent(
    message: IncomingMessage,
    selfId: number,
    resolveUrl?: ResolveMediaUrl,
): Promise<MessageEvent> {
    const isGroup = message.type === MessageType.GroupMessage;
    const segments = await Promise.all(message.segments.map((segment) => toSegment(segment, resolveUrl)));
    return {
        time: message.time,
        self_id: selfId,
        post_type: 'message',
        message_type: isGroup ? 'group' : 'private',
        sub_type: isGroup ? 'normal' : 'friend',
        message_id: message.sequence,
        user_id: message.senderUin,
        group_id: message.groupUin,
        message: segments,
        raw_message: segments.map(toCq).join(''),
        font: 0,
        sender: {
            user_id: message.senderUin,
            nickname: message.senderName,
        },
    };
}

/** uid → uin 解析器。 */
export type ResolveUin = (uid: string, groupUin?: number) => Promise<number>;

function increaseSubType(changeType: number): string {
    return changeType === IncreaseType.Invite ? 'invite' : 'approve';
}

function decreaseSubType(changeType: number): string {
    if (changeType === DecreaseType.KickSelf) {
        return 'kick_me';
    }
    if (changeType === DecreaseType.Exit) {
        return 'leave';
    }
    return 'kick';
}

/** 将通知转换为 OneBot 通知事件（非通知类返回 undefined）。 */
export async function toNoticeEvent(
    notification: Notification,
    selfId: number,
    resolveUin: ResolveUin,
): Promise<NoticeEvent | undefined> {
    const base = { time: Math.floor(Date.now() / 1000), self_id: selfId, post_type: 'notice' as const };
    switch (notification.type) {
        case 'friendRecall':
            return {
                ...base,
                notice_type: 'friend_recall',
                user_id: await resolveUin(notification.fromUid),
                message_id: notification.sequence,
            };
        case 'groupRecall': {
            const target = notification.messages[0];
            return {
                ...base,
                notice_type: 'group_recall',
                group_id: notification.groupUin,
                user_id: await resolveUin(target?.authorUid ?? '', notification.groupUin),
                operator_id: await resolveUin(notification.operatorUid, notification.groupUin),
                message_id: target?.sequence ?? 0,
            };
        }
        case 'groupMemberIncrease':
            return {
                ...base,
                notice_type: 'group_increase',
                sub_type: increaseSubType(notification.changeType),
                group_id: notification.groupUin,
                user_id: await resolveUin(notification.memberUid, notification.groupUin),
                operator_id: await resolveUin(notification.operatorUid ?? '', notification.groupUin),
            };
        case 'groupMemberDecrease':
            return {
                ...base,
                notice_type: 'group_decrease',
                sub_type: decreaseSubType(notification.changeType),
                group_id: notification.groupUin,
                user_id: await resolveUin(notification.memberUid, notification.groupUin),
                operator_id: await resolveUin(notification.operatorUid ?? '', notification.groupUin),
            };
        case 'groupAdminChange':
            return {
                ...base,
                notice_type: 'group_admin',
                sub_type: notification.set ? 'set' : 'unset',
                group_id: notification.groupUin,
                user_id: await resolveUin(notification.targetUid, notification.groupUin),
            };
        case 'groupMute':
            return {
                ...base,
                notice_type: 'group_ban',
                sub_type: notification.duration > 0 ? 'ban' : 'lift_ban',
                group_id: notification.groupUin,
                user_id: notification.targetUid ? await resolveUin(notification.targetUid, notification.groupUin) : 0,
                operator_id: await resolveUin(notification.operatorUid, notification.groupUin),
                duration: notification.duration,
            };
        case 'groupEssenceMessageChange':
            return {
                ...base,
                notice_type: 'essence',
                sub_type: notification.add ? 'add' : 'delete',
                group_id: notification.groupUin,
                message_id: notification.msgSequence,
                operator_id: notification.operatorUin,
                sender_id: notification.memberUin,
            };
        case 'groupNameChange':
            return {
                ...base,
                notice_type: 'group_name_change',
                group_id: notification.groupUin,
                operator_id: await resolveUin(notification.operatorUid, notification.groupUin),
                name: notification.name,
            };
        case 'groupReaction':
            return {
                ...base,
                notice_type: 'group_reaction',
                sub_type: notification.isAdd ? 'add' : 'remove',
                group_id: notification.groupUin,
                message_id: notification.sequence,
                operator_id: await resolveUin(notification.operatorUid, notification.groupUin),
                code: notification.code,
                reaction_type: notification.reactionType,
                count: notification.count,
            };
        case 'friendPoke':
            return {
                ...base,
                notice_type: 'notify',
                sub_type: 'poke',
                user_id: notification.operatorUin,
                target_id: notification.targetUin,
                action: notification.action,
                action_img_url: notification.actionImgUrl,
                suffix: notification.suffix,
            };
        case 'groupPoke':
            return {
                ...base,
                notice_type: 'notify',
                sub_type: 'poke',
                group_id: notification.groupUin,
                user_id: notification.operatorUin,
                target_id: notification.targetUin,
                action: notification.action,
                action_img_url: notification.actionImgUrl,
                suffix: notification.suffix,
            };
        default:
            return undefined;
    }
}

/** 将通知转换为 OneBot 请求事件（非请求类返回 undefined）。 */
export function toRequestEvent(notification: Notification, selfId: number): RequestEvent | undefined {
    const base = { time: Math.floor(Date.now() / 1000), self_id: selfId, post_type: 'request' as const };
    switch (notification.type) {
        case 'friendRequest':
            return {
                ...base,
                request_type: 'friend',
                user_id: notification.fromUin,
                comment: notification.message,
                flag: notification.fromUid,
            };
        case 'groupJoinRequest':
            return { ...base, request_type: 'group', sub_type: 'add', group_id: notification.groupUin, user_id: 0, comment: '', flag: notification.memberUid };
        case 'groupInvitedJoinRequest':
            return { ...base, request_type: 'group', sub_type: 'invite', group_id: notification.groupUin, user_id: 0, comment: '', flag: notification.targetUid };
        case 'groupInvitation':
            return { ...base, request_type: 'group', sub_type: 'invite', group_id: notification.groupUin, user_id: 0, comment: '', flag: notification.invitorUid };
        default:
            return undefined;
    }
}

/** 构造生命周期元事件。 */
export function toLifecycleEvent(selfId: number): LifecycleMetaEvent {
    return {
        time: Math.floor(Date.now() / 1000),
        self_id: selfId,
        post_type: 'meta_event',
        meta_event_type: 'lifecycle',
        sub_type: 'connect',
    };
}

/** 构造心跳元事件。 */
export function toHeartbeatEvent(selfId: number, interval: number): HeartbeatMetaEvent {
    return {
        time: Math.floor(Date.now() / 1000),
        self_id: selfId,
        post_type: 'meta_event',
        meta_event_type: 'heartbeat',
        status: { online: true, good: true },
        interval,
    };
}