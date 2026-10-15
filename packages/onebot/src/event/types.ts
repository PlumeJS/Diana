import type { Message } from '../message/segment.js';

/** 上报类型。 */
export type PostType = 'message' | 'message_sent' | 'notice' | 'request' | 'meta_event';

/** 消息类型。 */
export type MessageType = 'private' | 'group';

/** 通知类型。 */
export type NoticeType =
    | 'group_upload'
    | 'group_admin'
    | 'group_decrease'
    | 'group_increase'
    | 'group_ban'
    | 'friend_add'
    | 'group_recall'
    | 'friend_recall'
    | 'notify'
    | 'essence'
    | 'group_name_change'
    | 'group_reaction';

/** 请求类型。 */
export type RequestType = 'friend' | 'group';

/** 元事件类型。 */
export type MetaEventType = 'lifecycle' | 'heartbeat';

/** 所有事件共有的字段。 */
export interface EventBase {
    /** 事件发生时间戳（秒）。 */
    time: number;
    /** 机器人自身 QQ 号。 */
    self_id: number;
    /** 上报类型。 */
    post_type: PostType;
}

/** 消息发送者信息。 */
export interface SenderInfo {
    /** 发送者 QQ 号。 */
    user_id: number;
    /** 昵称。 */
    nickname: string;
    /** 群名片（群聊时存在）。 */
    card?: string;
    /** 群角色（群聊时存在）。 */
    role?: 'owner' | 'admin' | 'member';
    /** 性别。 */
    sex?: 'male' | 'female' | 'unknown';
    /** 年龄。 */
    age?: number;
    /** 等级。 */
    level?: string;
    /** 群头衔。 */
    title?: string;
}

/** 消息事件。 */
export interface MessageEvent extends EventBase {
    post_type: 'message' | 'message_sent';
    message_type: MessageType;
    sub_type: string;
    message_id: number;
    user_id: number;
    group_id?: number;
    message: Message;
    raw_message: string;
    font: number;
    sender: SenderInfo;
}

/** 通知事件。 */
export interface NoticeEvent extends EventBase {
    post_type: 'notice';
    notice_type: NoticeType;
    sub_type?: string;
    user_id?: number;
    group_id?: number;
    operator_id?: number;
    target_id?: number;
    message_id?: number;
    file?: { id: string; name: string; size: number; busid: number };
    duration?: number;
    /** 扩展：精华消息作者。 */
    sender_id?: number;
    /** 扩展：群名称变更后的新名称。 */
    name?: string;
    /** 扩展：表情回应内容与数量。 */
    code?: string;
    /** 扩展：表情回应类型（贴表情服务端返回的 reactionType）。 */
    reaction_type?: number;
    count?: number;
    /** 扩展：戳一戳动作文本。 */
    action?: string;
    /** 扩展：戳一戳动作图片 URL。 */
    action_img_url?: string;
    /** 扩展：戳一戳后缀文本。 */
    suffix?: string;
}

/** 请求事件。 */
export interface RequestEvent extends EventBase {
    post_type: 'request';
    request_type: RequestType;
    sub_type?: string;
    user_id: number;
    group_id?: number;
    comment: string;
    flag: string;
}

/** 生命周期元事件。 */
export interface LifecycleMetaEvent extends EventBase {
    post_type: 'meta_event';
    meta_event_type: 'lifecycle';
    sub_type: 'connect' | 'enable' | 'disable';
}

/** 心跳元事件。 */
export interface HeartbeatMetaEvent extends EventBase {
    post_type: 'meta_event';
    meta_event_type: 'heartbeat';
    status: { online: boolean; good: boolean };
    interval: number;
}

/** 元事件。 */
export type MetaEvent = LifecycleMetaEvent | HeartbeatMetaEvent;

/** 所有上报事件的联合类型。 */
export type Ob11Event = MessageEvent | NoticeEvent | RequestEvent | MetaEvent;
