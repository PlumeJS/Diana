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
            return {
                type: 'at',
                data: { qq: segment.uin === 0 ? 'all' : String(segment.uin), ...(segment.name ? { name: segment.name } : {}) },
            };
        case 'face':
            return { type: 'face', data: { id: String(segment.id) } };
        case 'image': {
            const url = segment.url ?? (await resolveUrl?.(segment));
            return { type: 'image', data: { file: url ?? '', ...(url ? { url } : {}) } };
        }
        case 'record': {
            const url = await resolveUrl?.(segment);
            return { type: 'record', data: { file: url ?? '', ...(url ? { url } : {}) } };
        }
        case 'lightApp':
            return { type: 'json', data: { data: segment.payload } };
        case 'forward':
            return { type: 'forward', data: { id: segment.resId } };
        case 'video': {
            const url = await resolveUrl?.(segment);
            return { type: 'video', data: { file: url ?? '', ...(url ? { url } : {}) } };
        }
    }
}

/** CQ 码文本转义（OneBot 11 标准）：纯文本中转义 & [ ]。 */
function escapeText(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/\[/g, '&#91;').replace(/\]/g, '&#93;');
}

/** CQ 码函数参数转义（OneBot 11 标准）：转义 & [ ] ,。 */
function escapeParam(value: string): string {
    return escapeText(value).replace(/,/g, '&#44;');
}

function toCq(segment: Segment): string {
    switch (segment.type) {
        case 'text':
            return escapeText(segment.data.text);
        case 'at':
            return segment.data.qq === 'all'
                ? '[CQ:at,qq=all]'
                : `[CQ:at,qq=${escapeParam(segment.data.qq)}]`;
        case 'reply':
            return `[CQ:reply,id=${escapeParam(segment.data.id)}]`;
        case 'face':
            return `[CQ:face,id=${escapeParam(segment.data.id)}]`;
        case 'image':
            return `[CQ:image,file=${escapeParam(segment.data.file)}${segment.data.url ? `,url=${escapeParam(segment.data.url)}` : ''}]`;
        case 'record':
            return `[CQ:record,file=${escapeParam(segment.data.file)}${segment.data.url ? `,url=${escapeParam(segment.data.url)}` : ''}]`;
        case 'video':
            return `[CQ:video,file=${escapeParam(segment.data.file)}${segment.data.url ? `,url=${escapeParam(segment.data.url)}` : ''}]`;
        case 'json':
            return `[CQ:json,data=${escapeParam(segment.data.data)}]`;
        case 'forward':
            return `[CQ:forward,id=${escapeParam(segment.data.id)}]`;
        default:
            return `[CQ:${segment.type}]`;
    }
}

/** 将入站消息转换为 OneBot 消息段数组，存在引用时前置 reply 段（id 为被引用消息的 message_id）。 */
async function toSegments(message: IncomingMessage, resolveUrl?: ResolveMediaUrl): Promise<Segment[]> {
    const segments = await Promise.all(message.segments.map((segment) => toSegment(segment, resolveUrl)));
    if (message.repliedSequence !== undefined) {
        segments.unshift({ type: 'reply', data: { id: String(message.repliedSequence) } });
    }
    return segments;
}

/** `get_msg` / 历史消息返回的消息数据。 */
export interface MessageData {
    message_id: number;
    real_id: number;
    message_type: 'private' | 'group';
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
    const segments = await toSegments(message, resolveUrl);
    return {
        message_id: message.sequence,
        real_id: message.sequence,
        message_type: isGroup ? 'group' : 'private',
        user_id: message.senderUin,
        ...(isGroup ? { group_id: message.groupUin } : {}),
        time: message.time,
        message: segments,
        raw_message: segments.map(toCq).join(''),
        // 群聊时 senderName 即群名片，私聊时为好友昵称
        sender: { user_id: message.senderUin, nickname: message.senderName, ...(isGroup ? { card: message.senderName } : {}) },
    };
}

/** 将入站消息转换为 OneBot 消息事件。 */
export async function toMessageEvent(
    message: IncomingMessage,
    selfId: number,
    resolveUrl?: ResolveMediaUrl,
    resolveName?: ResolveName,
): Promise<MessageEvent> {
    const isGroup = message.type === MessageType.GroupMessage;
    const segments = await toSegments(message, resolveUrl);
    // 私聊推送的 friendName 经常缺失，回退到 uid 目录解析好友昵称
    let nickname = message.senderName;
    if (!nickname && !isGroup && resolveName) {
        nickname = await resolveName(message.senderUid ?? '');
    }
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
            nickname,
            ...(isGroup ? { card: message.senderName } : {}),
        },
    };
}

/** uid → uin 解析器。 */
export type ResolveUin = (uid: string, groupUin?: number) => Promise<number>;

/** uid → 昵称解析器。 */
export type ResolveName = (uid: string, groupUin?: number) => Promise<string>;

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
    resolveName?: ResolveName,
): Promise<NoticeEvent | undefined> {
    const base = { time: Math.floor(Date.now() / 1000), self_id: selfId, post_type: 'notice' as const };
    switch (notification.type) {
        case 'friendRecall': {
            // 对齐 Lagrange：自己撤回时 fromUid 是自己，事件主体应为对端（PeerUin）
            const fromUin = await resolveUin(notification.fromUid);
            const isSelf = fromUin === selfId;
            const userId = isSelf ? await resolveUin(notification.toUid) : fromUin;
            const nickname = (await resolveName?.(isSelf ? notification.toUid : notification.fromUid)) ?? '';
            return {
                ...base,
                notice_type: 'friend_recall',
                user_id: userId,
                message_id: notification.sequence,
                ...(nickname ? { nickname } : {}),
            };
        }
        case 'groupRecall': {
            const target = notification.messages[0];
            const authorUid = target?.authorUid ?? '';
            const nickname = (await resolveName?.(authorUid, notification.groupUin)) ?? '';
            return {
                ...base,
                notice_type: 'group_recall',
                group_id: notification.groupUin,
                user_id: await resolveUin(authorUid, notification.groupUin),
                operator_id: await resolveUin(notification.operatorUid, notification.groupUin),
                message_id: target?.sequence ?? 0,
                ...(nickname ? { nickname } : {}),
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