import type { Message } from '../message/segment.js';

/** 通用请求信封。 */
export interface ApiRequest<TParams = unknown> {
    action: string;
    params?: TParams;
    echo?: string;
}

/** 通用响应信封。 */
export interface ApiResponse<TData = unknown> {
    status: 'ok' | 'failed';
    retcode: number;
    data: TData;
    message?: string;
    wording?: string;
    echo?: string;
}

/** 发送消息通用参数。 */
export interface SendMessageParams {
    message: Message;
    auto_escape?: boolean;
}

/** 发送私聊消息参数。 */
export interface SendPrivateMsgParams extends SendMessageParams {
    user_id: number;
}

/** 发送群消息参数。 */
export interface SendGroupMsgParams extends SendMessageParams {
    group_id: number;
}

/** 发送消息返回。 */
export interface SendMessageResult {
    message_id: number;
}

/** 获取消息参数。 */
export interface GetMsgParams {
    message_id: number;
}

/** 撤回消息参数。 */
export interface DeleteMsgParams {
    message_id: number;
}

/** 获取群成员信息参数。 */
export interface GetGroupMemberInfoParams {
    group_id: number;
    user_id: number;
    no_cache?: boolean;
}

/** 通用成功响应（data 为 null）。 */
export type OkResponse = ApiResponse<null>;
