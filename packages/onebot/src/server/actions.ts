import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import {
    buildForwardCard,
    computeMediaMetadata,
    DEFAULT_VIDEO_THUMBNAIL,
    DianaError,
    ErrorCode,
    forwardPreviews,
    GroupMemberPermission,
    GroupNotificationType,
    MessageType,
} from '@diana/core';
import type { ForwardMessageNode, ForwardNode, ForwardTarget, GroupMember, ImageMetadata, IncomingMessage, IncomingSegment, OutgoingSegment, ReplyInfo } from '@diana/core';
import type { ApiResponse } from '../api/types.js';
import type { OneBotContext } from '../ctx.js';
import { type ResolveMediaUrl, toMessageData, toSegment } from '../event/convert.js';
import { amrDuration, normalizeImage, probeVideo, resolveFile, sniffImage } from '../media/index.js';
import { type Message, type NodeSegment, type Segment, messageSchema, tryParseMessage } from '../message/segment.js';

/** 为一条入站消息创建媒体 URL 解析器（对齐 acidify：现场调 oidb 200 换新鲜 rkey）。 */
function createMediaUrlResolver(ctx: OneBotContext, message: IncomingMessage): ResolveMediaUrl {
    return async (segment: IncomingSegment) => {
        const indexNode =
            segment.type === 'image' ? segment.indexNode
            : segment.type === 'record' ? segment.indexNode
            : segment.type === 'video' ? segment.indexNode
            : undefined;
        if (!indexNode) {
            return undefined;
        }
        const isGroup = message.type === MessageType.GroupMessage && message.groupUin !== undefined;
        if (isGroup) {
            if (segment.type === 'image') {
                return ctx.media.getGroupImageDownloadUrl(indexNode);
            }
            if (segment.type === 'record') {
                return ctx.media.getGroupRecordDownloadUrl(indexNode);
            }
            if (segment.type === 'video') {
                return ctx.media.getGroupVideoDownloadUrl(indexNode);
            }
        } else if (message.type === MessageType.PrivateMessage && message.senderUid) {
            if (segment.type === 'image') {
                return ctx.media.getPrivateImageDownloadUrl(message.senderUid, indexNode);
            }
            if (segment.type === 'record') {
                return ctx.media.getPrivateRecordDownloadUrl(message.senderUid, indexNode);
            }
            if (segment.type === 'video') {
                return ctx.media.getPrivateVideoDownloadUrl(message.senderUid, indexNode);
            }
        }
        return undefined;
    };
}

function ok<T>(data: T): ApiResponse<T> {
    return { status: 'ok', retcode: 0, data };
}

function fail(retcode: number, message: string): ApiResponse<null> {
    return { status: 'failed', retcode, data: null, message, wording: message };
}

function asNumber(value: unknown): number {
    return typeof value === 'number' ? value : Number(value);
}

function permissionToRole(permission: number): 'owner' | 'admin' | 'member' {
    if (permission === GroupMemberPermission.Owner) {
        return 'owner';
    }
    if (permission === GroupMemberPermission.Admin) {
        return 'admin';
    }
    return 'member';
}

function genderToSex(gender: number | undefined): 'male' | 'female' | 'unknown' {
    if (gender === 1) {
        return 'male';
    }
    if (gender === 2) {
        return 'female';
    }
    return 'unknown';
}

function toMember(groupId: number, member: GroupMember) {
    return {
        group_id: groupId,
        user_id: member.uin,
        nickname: member.nickname,
        card: member.card,
        sex: 'unknown',
        age: 0,
        area: '',
        join_time: member.joinTimestamp,
        last_sent_time: member.lastMsgTimestamp,
        level: String(member.level),
        role: permissionToRole(member.permission),
        unfriendly: false,
        title: member.specialTitle,
        title_expire_time: 0,
        card_changeable: true,
    };
}

/** 获取网页 Cookie 时默认请求的域名列表。 */
const DEFAULT_COOKIE_DOMAINS = [
    'qun.qq.com',
    'connect.qq.com',
    'docs.qq.com',
    'guopan.qq.com',
    'gamecenter.qq.com',
    'office.qq.com',
];

/** 将 Cookie 键值对拼接为 `key=value; key=value` 形式。 */
function joinCookies(cookies: Record<string, string>): string {
    return Object.entries(cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');
}

/** 发送目标。 */
type SendTarget = { kind: 'group'; groupUin: number } | { kind: 'private'; uin: number };

/** 媒体上传目标（私聊需要 uid 与 uin）。 */
type MediaTarget = { kind: 'group'; groupUin: number } | { kind: 'private'; uin: number; uid: string };

function isMediaSegment(segment: Segment): boolean {
    return segment.type === 'image' || segment.type === 'record' || segment.type === 'video';
}

/** 推断文件名：本地/URL 取路径末段，data URI 由 MIME 推断。 */
function inferFileName(file: string): string | undefined {
    if (!file.startsWith('data:')) {
        const nameMatch = /(?:^|[\\/])([^\\/?#]+)$/.exec(file.replace(/[?#].*$/, ''));
        if (nameMatch?.[1]) {
            return nameMatch[1];
        }
        return undefined;
    }
    const mime = /^data:([^;,]+)/.exec(file)?.[1];
    if (!mime) {
        return undefined;
    }
    const ext = mime.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin';
    return `file.${ext}`;
}

async function uploadFile(ctx: OneBotContext, target: MediaTarget, segment: Segment): Promise<void> {
    if (segment.type !== 'file') {
        return;
    }
    // 兼容标准 `data` 嵌套结构与 Karin 等客户端的扁平结构
    const fileData = segment.data ?? segment;
    const file = fileData.file ?? segment.file;
    if (!file) {
        throw new DianaError(ErrorCode.Validation, 'file 段缺少 file 字段');
    }
    const data = await resolveFile(file);
    const fileName = fileData.name ?? segment.name ?? inferFileName(file);
    if (!fileName) {
        throw new DianaError(ErrorCode.Validation, 'file 段缺少文件名且无法推断');
    }
    const meta = computeMediaMetadata(data);
    if (target.kind === 'group') {
        await ctx.groupFile.upload(target.groupUin, '/', fileName, data, meta);
    } else {
        await ctx.privateFile.upload(target.uin, target.uid, fileName, data, meta);
    }
}

async function resolveUid(ctx: OneBotContext, uin: number): Promise<string> {
    const result = await ctx.friend.fetchFriends();
    const friend = result.friends.find((item) => item.uin === uin);
    if (!friend) {
        throw new DianaError(ErrorCode.Validation, `无法解析用户 ${uin} 的 uid（非好友）`);
    }
    return friend.uid;
}

async function resolveGroupUid(ctx: OneBotContext, groupUin: number, uin: number): Promise<string> {
    const result = await ctx.group.fetchGroupMembers(groupUin);
    const member = result.members.find((item) => item.uin === uin);
    if (!member) {
        throw new DianaError(ErrorCode.Validation, `群 ${groupUin} 中不存在成员 ${uin}`);
    }
    return member.uid;
}

async function uploadImage(ctx: OneBotContext, target: MediaTarget, file: string): Promise<OutgoingSegment> {
    // ICO 不被官方支持，内嵌 PNG 帧时先提取为 PNG 再上传
    const data = normalizeImage(await resolveFile(file));
    const image: ImageMetadata = { ...computeMediaMetadata(data), ...sniffImage(data) };
    if (target.kind === 'group') {
        const { msgInfo, compat } = await ctx.media.uploadGroupImage(target.groupUin, data, image);
        // 兼容元素原样透传，避免解码-重编码丢失未建模字段导致“图片已过期”
        return { type: 'image', msgInfo, compatFace: compat };
    }
    const { msgInfo, compat } = await ctx.media.uploadPrivateImage(target.uid, data, image);
    return { type: 'image', msgInfo, compatImage: compat };
}

async function uploadRecord(ctx: OneBotContext, target: MediaTarget, file: string): Promise<OutgoingSegment> {
    const data = await resolveFile(file);
    const meta = computeMediaMetadata(data);
    const duration = amrDuration(data) || 1000;
    const { msgInfo } =
        target.kind === 'group'
            ? await ctx.media.uploadGroupRecord(target.groupUin, data, meta, duration)
            : await ctx.media.uploadPrivateRecord(target.uid, data, meta, duration);
    return { type: 'record', msgInfo };
}

async function uploadVideo(ctx: OneBotContext, target: MediaTarget, file: string): Promise<OutgoingSegment> {
    const data = await resolveFile(file);
    const meta = computeMediaMetadata(data);
    // 解析视频宽高与时长，供客户端显示进度条
    const videoMeta = probeVideo(data);
    // OneBot 的 video 段不带封面，使用官方内置封面
    const thumbnail = {
        data: DEFAULT_VIDEO_THUMBNAIL,
        image: { ...computeMediaMetadata(DEFAULT_VIDEO_THUMBNAIL), ...sniffImage(DEFAULT_VIDEO_THUMBNAIL) },
    };
    const { msgInfo } =
        target.kind === 'group'
            ? await ctx.media.uploadGroupVideo(target.groupUin, data, meta, thumbnail, videoMeta)
            : await ctx.media.uploadPrivateVideo(target.uid, data, meta, thumbnail, videoMeta);
    return { type: 'video', msgInfo };
}

async function toOutgoingSegment(
    ctx: OneBotContext,
    target: MediaTarget,
    segment: Segment,
): Promise<OutgoingSegment | null> {
    switch (segment.type) {
        case 'text':
            return { type: 'text', content: segment.data.text };
        case 'at':
            return segment.data.qq === 'all'
                ? { type: 'mention', uin: 0, name: '全体成员' }
                : { type: 'mention', uin: Number(segment.data.qq), name: segment.data.name ?? '' };
        case 'face': {
            const id = Number(segment.data.id);
            const detail = ctx.system.faceDetails.get(String(id));
            return {
                type: 'face',
                id,
                large: segment.data.large,
                detail: detail
                    ? {
                          qDes: detail.qDes,
                          aniStickerType: detail.aniStickerType,
                          aniStickerPackId: detail.aniStickerPackId,
                          aniStickerId: detail.aniStickerId,
                      }
                    : undefined,
            };
        }
        case 'image':
            return uploadImage(ctx, target, segment.data.file);
        case 'record':
            return uploadRecord(ctx, target, segment.data.file);
        case 'video':
            return uploadVideo(ctx, target, segment.data.file);
        case 'json':
            return { type: 'lightApp', payload: segment.data.data };
        case 'file':
            // 文件不走消息段：群文件由服务端广播，私聊文件走 Trans211 独立发送
            await uploadFile(ctx, target, segment);
            return null;
        default:
            throw new DianaError(ErrorCode.Validation, `暂不支持的段类型: ${segment.type}`);
    }
}

/** 归一化 `node` 段内容：字符串、消息段数组或单个消息段。 */
function normalizeNodeContent(content: unknown): Message {
    if (typeof content === 'string') {
        return content;
    }
    const parsed = tryParseMessage(Array.isArray(content) ? content : [content]);
    if (!parsed) {
        throw new DianaError(ErrorCode.Validation, 'node 段的 content 不是合法的消息');
    }
    return parsed;
}

/** 将 OneBot `node` 段转换为合并转发节点。 */
async function buildForwardNodes(ctx: OneBotContext, target: MediaTarget, segments: NodeSegment[]): Promise<ForwardNode[]> {
    const nodes: ForwardNode[] = [];
    for (const segment of segments) {
        const content = normalizeNodeContent(segment.data.content);
        const outgoing: OutgoingSegment[] = [];
        if (typeof content === 'string') {
            outgoing.push({ type: 'text', content });
        } else {
            for (const item of content) {
                const converted = await toOutgoingSegment(ctx, target, item);
                if (converted) {
                    outgoing.push(converted);
                }
            }
        }
        nodes.push({
            uin: Number(segment.data.user_id ?? segment.data.uin ?? ctx.selfId),
            nickname: segment.data.nickname ?? segment.data.name ?? '',
            time: Math.floor(Date.now() / 1000),
            segments: outgoing,
        });
    }
    return nodes;
}

/** 发送戳一戳（`poke` 段 / `send_poke` 动作共用）。 */
async function sendPoke(ctx: OneBotContext, target: SendTarget, uin: number): Promise<void> {
    if (target.kind === 'group') {
        await ctx.group.pokeMember(target.groupUin, uin);
    } else {
        await ctx.friend.poke(uin);
    }
}

/** 出站消息：消息段与引用信息。 */
export interface OutgoingMessage {
    segments: OutgoingSegment[];
    reply?: ReplyInfo;
}

/** 将 OneBot 消息转换为核心出站消息段（媒体段会先上传，`poke` 段直接发送）。 */
export async function buildOutgoingSegments(
    ctx: OneBotContext,
    message: Message,
    target: SendTarget,
): Promise<OutgoingMessage> {
    if (typeof message === 'string') {
        return { segments: [{ type: 'text', content: message }] };
    }
    const needsUid =
        target.kind === 'private' &&
        message.some(
            (segment) =>
                isMediaSegment(segment) || segment.type === 'node' || segment.type === 'forward' || segment.type === 'file',
        );
    const uid = target.kind === 'private' && needsUid ? await resolveUid(ctx, target.uin) : '';
    const mediaTarget: MediaTarget =
        target.kind === 'group' ? target : { kind: 'private', uin: target.uin, uid };
    const forwardTarget: ForwardTarget =
        target.kind === 'group' ? { kind: 'group', groupUin: target.groupUin } : { kind: 'private', uin: target.uin, uid };
    const segments: OutgoingSegment[] = [];
    let reply: ReplyInfo | undefined;
    const nodes = message.filter((segment): segment is NodeSegment => segment.type === 'node');
    if (nodes.length > 0) {
        const forwardNodes = await buildForwardNodes(ctx, mediaTarget, nodes);
        const resId = await ctx.message.uploadForward(forwardTarget, forwardNodes);
        segments.push({ type: 'lightApp', payload: buildForwardCard(resId, forwardPreviews(forwardNodes)) });
    }
    for (const segment of message) {
        if (segment.type === 'reply') {
            const sequence = Number(segment.data.id);
            reply = ctx.message.resolveReply(sequence) ?? { sequence, senderUin: 0 };
            continue;
        }
        if (segment.type === 'poke') {
            await sendPoke(ctx, target, Number(segment.data.id));
            continue;
        }
        if (segment.type === 'node') {
            continue;
        }
        if (segment.type === 'file') {
            await toOutgoingSegment(ctx, mediaTarget, segment);
            continue;
        }
        if (segment.type === 'forward') {
            // 重新转发已存在的合并转发：拉取内容生成卡片，随后按 resid 直接发送
            const previews = await ctx.message.fetchForwardPreviews(forwardTarget, segment.data.id);
            segments.push({ type: 'lightApp', payload: buildForwardCard(segment.data.id, previews) });
            continue;
        }
        const converted = await toOutgoingSegment(ctx, mediaTarget, segment);
        if (converted) {
            segments.push(converted);
        }
    }
    return { segments, reply };
}

/** 校验并解析动作参数中的消息，失败时抛出带原因的错误。 */
function requireMessage(input: unknown): Message {
    const result = messageSchema.safeParse(input);
    if (!result.success) {
        const issue = result.error.issues[0];
        const path = issue && issue.path.length > 0 ? ` (${issue.path.join('.')})` : '';
        throw new DianaError(ErrorCode.Validation, `消息格式不合法: ${issue?.message ?? '未知原因'}${path}`);
    }
    return result.data;
}

async function sendPrivate(ctx: OneBotContext, params: Record<string, unknown>) {
    const uin = asNumber(params.user_id);
    const { segments, reply } = await buildOutgoingSegments(ctx, requireMessage(params.message ?? params.messages), {
        kind: 'private',
        uin,
    });
    if (segments.length === 0) {
        return ok({ message_id: 0 });
    }
    const result = await ctx.message.sendPrivateMessage({ uin, segments, reply });
    return ok({ message_id: result.sequence });
}

async function sendGroup(ctx: OneBotContext, params: Record<string, unknown>) {
    const groupUin = asNumber(params.group_id);
    const { segments, reply } = await buildOutgoingSegments(ctx, requireMessage(params.message ?? params.messages), {
        kind: 'group',
        groupUin,
    });
    if (segments.length === 0) {
        return ok({ message_id: 0 });
    }
    const result = await ctx.message.sendGroupMessage({ groupUin, segments, reply });
    return ok({ message_id: result.sequence });
}

/** 拉取合并转发内容（`get_forward_msg`），群聊/私聊格式逐一尝试。 */
async function fetchForwardNodes(ctx: OneBotContext, resId: string): Promise<ForwardMessageNode[]> {
    try {
        return await ctx.message.fetchForwardMessages({ kind: 'group', groupUin: 0 }, resId);
    } catch (error) {
        if (error instanceof DianaError && error.code === ErrorCode.Protocol) {
            return ctx.message.fetchForwardMessages({ kind: 'private', uin: 0, uid: '' }, resId);
        }
        throw error;
    }
}

/** 处理 OneBot 动作请求。 */
export async function handleAction(
    ctx: OneBotContext,
    action: string,
    params: Record<string, unknown>,
): Promise<ApiResponse> {
    switch (action) {
        case 'get_login_info': {
            const info = await ctx.user.fetchUserInfo(ctx.selfId);
            return ok({ user_id: ctx.selfId, nickname: info.nickname ?? '' });
        }
        case 'get_status':
            return ok({ online: ctx.transport.isConnected, good: true });
        case 'get_version_info':
            return ok({
                app_name: 'Diana',
                app_version: '0.0.0',
                protocol_version: 'v11',
                app_full_name: 'Diana',
            });
        case 'can_send_image':
        case 'can_send_record':
            return ok(true);
        case 'send_private_msg':
            return sendPrivate(ctx, params);
        case 'send_group_msg':
            return sendGroup(ctx, params);
        case 'send_msg':
            // 依据 group_id / user_id 参数路由（部分调用方只传 id 而不传 message_type）
            if (params.group_id !== undefined) {
                return sendGroup(ctx, params);
            }
            if (params.user_id !== undefined) {
                return sendPrivate(ctx, params);
            }
            throw new DianaError(ErrorCode.Validation, 'send_msg 需要 group_id 或 user_id');
        case 'get_friend_list': {
            const result = await ctx.friend.fetchFriends();
            return ok(result.friends.map((friend) => ({ user_id: friend.uin, nickname: friend.nickname, remark: friend.remark })));
        }
        case 'get_group_list': {
            const groups = await ctx.group.fetchGroups();
            return ok(
                groups.map((group) => ({
                    group_id: group.groupUin,
                    group_name: group.name,
                    member_count: group.memberCount,
                    max_member_count: group.memberMax,
                })),
            );
        }
        case 'get_group_member_list': {
            const groupId = asNumber(params.group_id);
            const result = await ctx.group.fetchGroupMembers(groupId);
            return ok(result.members.map((member) => toMember(groupId, member)));
        }
        case 'get_group_member_info': {
            const groupId = asNumber(params.group_id);
            const userId = asNumber(params.user_id);
            const result = await ctx.group.fetchGroupMembers(groupId);
            const member = result.members.find((item) => item.uin === userId);
            return member ? ok(toMember(groupId, member)) : fail(1404, '群成员不存在');
        }
        case 'get_stranger_info': {
            const info = await ctx.user.fetchUserInfo(asNumber(params.user_id));
            return ok({
                user_id: info.uin,
                nickname: info.nickname ?? '',
                sex: genderToSex(info.gender),
                age: info.age ?? 0,
            });
        }
        case 'delete_msg':
            await ctx.message.recallMessage(asNumber(params.message_id), (uin) => resolveUid(ctx, uin));
            return ok(null);
        case 'send_like': {
            const uid = await resolveUid(ctx, asNumber(params.user_id));
            await ctx.friend.sendLike(uid, params.times === undefined ? 1 : asNumber(params.times));
            return ok(null);
        }
        case 'friend_poke':
            await ctx.friend.poke(asNumber(params.user_id));
            return ok(null);
        case 'group_poke':
            await ctx.group.pokeMember(asNumber(params.group_id), asNumber(params.user_id));
            return ok(null);
        case 'send_poke': {
            const groupId = params.group_id === undefined ? undefined : asNumber(params.group_id);
            if (groupId === undefined) {
                await ctx.friend.poke(asNumber(params.user_id));
            } else {
                await ctx.group.pokeMember(groupId, asNumber(params.user_id));
            }
            return ok(null);
        }
        case 'set_group_message_reaction':
        case 'set_msg_emoji_like': {
            const groupUin = asNumber(params.group_id);
            const sequence = asNumber(params.message_id);
            const code = String(params.code ?? params.emoji_id ?? '');
            const add = params.set === undefined ? true : Boolean(params.set);
            // 对齐 NapCat/Lagrange：表情 ID 超过 3 位为 unicode 表情（type=2），QQ 表情为 1
            const reactionType = code.length > 3 ? 2 : 1;
            await ctx.group.setMessageReaction(groupUin, sequence, code, reactionType, add);
            return ok(null);
        }
        case 'set_group_ban': {
            const groupUin = asNumber(params.group_id);
            const uid = await resolveGroupUid(ctx, groupUin, asNumber(params.user_id));
            await ctx.group.muteMember(groupUin, uid, asNumber(params.duration));
            return ok(null);
        }
        case 'set_group_whole_ban':
            await ctx.group.muteAllMembers(asNumber(params.group_id), Boolean(params.enable));
            return ok(null);
        case 'set_group_card': {
            const groupUin = asNumber(params.group_id);
            const uid = await resolveGroupUid(ctx, groupUin, asNumber(params.user_id));
            await ctx.group.setMemberCard(groupUin, uid, String(params.card ?? ''));
            return ok(null);
        }
        case 'set_group_kick': {
            const groupUin = asNumber(params.group_id);
            const uid = await resolveGroupUid(ctx, groupUin, asNumber(params.user_id));
            await ctx.group.kickMember(groupUin, uid, Boolean(params.reject_add_request), '');
            return ok(null);
        }
        case 'set_group_name':
            await ctx.group.setGroupName(asNumber(params.group_id), String(params.group_name ?? ''));
            return ok(null);
        case 'get_msg': {
            const message = ctx.message.getCachedMessage(asNumber(params.message_id));
            return message ? ok(await toMessageData(message, createMediaUrlResolver(ctx, message))) : fail(1404, '消息不存在或已过期');
        }
        case 'get_group_info': {
            const groupUin = asNumber(params.group_id);
            const group = (await ctx.group.fetchGroups()).find((item) => item.groupUin === groupUin);
            return group
                ? ok({
                      group_id: group.groupUin,
                      group_name: group.name,
                      member_count: group.memberCount,
                      max_member_count: group.memberMax,
                  })
                : fail(1404, '群不存在');
        }
        case 'send_private_forward_msg':
            return sendPrivate(ctx, params);
        case 'send_group_forward_msg':
            return sendGroup(ctx, params);
        case 'get_forward_msg': {
            const resId = String(params.message_id ?? params.id ?? '');
            const nodes = await fetchForwardNodes(ctx, resId);
            return ok({
                messages: await Promise.all(nodes.map(async (node) => ({
                    time: node.time,
                    sender: { user_id: node.uin, nickname: node.nickname },
                    content: await Promise.all(node.segments.map((segment) => toSegment(segment))),
                }))),
            });
        }
        case 'get_image':
            // 入站图片的 file 字段即为可直接访问的 URL，原样返回
            return ok({ file: String(params.file ?? '') });
        case 'get_record':
            return ok({ file: String(params.file ?? '') });
        case 'get_group_msg_history': {
            const groupUin = asNumber(params.group_id);
            const count = asNumber(params.count ?? 20) || 20;
            // 锚点序列号（含），0 表示从最新一条往回取
            const anchor = asNumber(params.message_seq ?? 0);
            const end = anchor > 0 ? anchor : await ctx.group.fetchLatestMessageSeq(groupUin);
            const messages = await ctx.message.fetchGroupMessages(groupUin, Math.max(1, end - count + 1), end);
            return ok({ messages: await Promise.all(messages.map((m) => toMessageData(m, createMediaUrlResolver(ctx, m)))) });
        }
        case 'get_friend_msg_history': {
            const uid = await resolveUid(ctx, asNumber(params.user_id));
            const count = asNumber(params.count ?? 20) || 20;
            const anchor = asNumber(params.message_seq ?? 0);
            const end = anchor > 0 ? anchor : await ctx.message.fetchC2CLatestSequence(uid);
            const messages = await ctx.message.fetchC2CMessages(uid, Math.max(1, end - count + 1), end);
            return ok({ messages: await Promise.all(messages.map((m) => toMessageData(m, createMediaUrlResolver(ctx, m)))) });
        }
        case 'set_group_leave':
            await ctx.group.quitGroup(asNumber(params.group_id));
            return ok(null);
        case 'set_group_admin': {
            const groupUin = asNumber(params.group_id);
            const uid = await resolveGroupUid(ctx, groupUin, asNumber(params.user_id));
            await ctx.group.setMemberAdmin(groupUin, uid, Boolean(params.enable));
            return ok(null);
        }
        case 'set_group_special_title': {
            const groupUin = asNumber(params.group_id);
            const uid = await resolveGroupUid(ctx, groupUin, asNumber(params.user_id));
            await ctx.group.setMemberSpecialTitle(groupUin, uid, String(params.special_title ?? ''));
            return ok(null);
        }
        case 'set_friend_add_request':
            await ctx.friend.handleFriendRequest(String(params.flag ?? ''), Boolean(params.approve));
            return ok(null);
        case 'set_group_add_request': {
            const groupUin = asNumber(params.group_id);
            const flag = String(params.flag ?? '');
            // flag 携带的是申请者/邀请者 uid，需在群通知列表中定位对应申请拿到序列号
            const notifications = await ctx.group.fetchGroupNotifications(50);
            const entry = notifications.find(
                (item) => item.groupUin === groupUin && (item.targetUid === flag || item.invitorUid === flag),
            );
            if (!entry) {
                return fail(1404, '未找到对应的入群申请/邀请');
            }
            // eventType：1=入群申请，2=他人邀请我入群
            const eventType = entry.type === GroupNotificationType.Invite ? 2 : 1;
            await ctx.group.handleGroupRequest(
                groupUin,
                entry.sequence,
                eventType,
                Boolean(params.approve),
                String(params.reason ?? ''),
            );
            return ok(null);
        }
        case 'clean_cache':
            ctx.message.clearCaches();
            return ok(null);
        case 'get_cookies': {
            const domains =
                params.domain === undefined ? DEFAULT_COOKIE_DOMAINS
                : Array.isArray(params.domain) ? params.domain.map(String)
                : [String(params.domain)];
            const cookies = await ctx.system.fetchCookies(domains);
            return ok({ cookies: joinCookies(cookies) });
        }
        case 'get_csrf_token':
            return ok({ token: await ctx.system.fetchCsrfToken() });
        case 'get_credentials': {
            const cookies = await ctx.system.fetchCookies(DEFAULT_COOKIE_DOMAINS);
            return ok({ cookies: joinCookies(cookies), csrf_token: await ctx.system.fetchCsrfToken() });
        }
        case 'get_roam_msg': {
            const uid = await resolveUid(ctx, asNumber(params.user_id));
            const count = Math.min(asNumber(params.count ?? 20) || 20, 30);
            const anchor = asNumber(params.message_seq ?? 0);
            // 漫游以时间戳为锚点，未提供时从当前时间往回取
            const time = anchor > 0 ? anchor : Math.floor(Date.now() / 1000);
            const messages = await ctx.message.fetchRoamMessages(uid, time, count);
            return ok({ messages: await Promise.all(messages.map((m) => toMessageData(m, createMediaUrlResolver(ctx, m)))) });
        }
        case 'upload_group_file': {
            const groupUin = asNumber(params.group_id);
            const file = String(params.file ?? '');
            const data = await resolveFile(file);
            const fileName = String(params.name ?? '') || inferFileName(file);
            if (!fileName) {
                throw new DianaError(ErrorCode.Validation, '缺少文件名且无法从路径推断');
            }
            await ctx.groupFile.upload(groupUin, String(params.folder ?? '/'), fileName, data, computeMediaMetadata(data));
            return ok(null);
        }
        case 'upload_private_file': {
            const uin = asNumber(params.user_id);
            const file = String(params.file ?? '');
            const data = await resolveFile(file);
            const fileName = String(params.name ?? '') || inferFileName(file);
            if (!fileName) {
                throw new DianaError(ErrorCode.Validation, '缺少文件名且无法从路径推断');
            }
            const uid = await resolveUid(ctx, uin);
            await ctx.privateFile.upload(uin, uid, fileName, data, computeMediaMetadata(data));
            return ok(null);
        }
        case 'get_group_file_url': {
            const url = await ctx.groupFile.getDownloadUrl(asNumber(params.group_id), String(params.file_id ?? ''));
            return ok({ url });
        }
        case 'delete_group_file':
            await ctx.groupFile.delete(asNumber(params.group_id), String(params.file_id ?? ''));
            return ok(null);
        case 'rename_group_file':
            await ctx.groupFile.rename(
                asNumber(params.group_id),
                String(params.file_id ?? ''),
                String(params.current_parent_directory ?? '/'),
                String(params.new_name ?? ''),
            );
            return ok(null);
        case 'move_group_file':
            await ctx.groupFile.move(
                asNumber(params.group_id),
                String(params.file_id ?? ''),
                String(params.current_parent_directory ?? '/'),
                String(params.target_parent_directory ?? '/'),
            );
            return ok(null);
        case 'create_group_file_folder': {
            const folderId = await ctx.groupFile.createFolder(
                asNumber(params.group_id),
                String(params.name ?? params.folder_name ?? ''),
            );
            return ok({ folder_id: folderId });
        }
        case 'download_file': {
            // 将远端 URL 下载到本地临时文件，返回本地路径（供调用方再作为 file 参数上传）
            const url = String(params.url ?? '');
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                throw new DianaError(ErrorCode.Validation, `download_file 仅支持 http(s) URL: ${url}`);
            }
            const response = await fetch(url);
            if (!response.ok) {
                throw new DianaError(ErrorCode.Network, `下载文件失败 (${response.status}): ${url}`);
            }
            const data = Buffer.from(await response.arrayBuffer());
            const name = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '') || 'file';
            const path = join(tmpdir(), `diana-download-${randomUUID()}-${name}`);
            await writeFile(path, data);
            return ok({ file: path });
        }
        // 以下 action 在 NTQQ 协议层暂无可靠参照（资料设置 / 群头像 / 私聊文件下载 /
        // 频道 / 在线客户端 / 机型展示 / 群荣誉 / 匿名消息 / 进程重启），
        // 返回与官方实现一致的空结果，避免调用方因报错中断。
        case 'set_qq_profile':
        case 'set_qq_avatar':
        case 'set_group_portrait':
            return ok(null);
        case 'set_essence_msg':
        case 'delete_essence_msg': {
            const groupUin = asNumber(params.group_id);
            const sequence = asNumber(params.message_id);
            // random 优先取缓存消息；缓存缺失时按序列号附近拉取群历史补齐
            const random =
                ctx.message.getCachedMessage(sequence)?.random ??
                (await ctx.message.fetchGroupMessages(groupUin, Math.max(0, sequence - 10), sequence)).find(
                    (message) => message.sequence === sequence,
                )?.random ??
                0;
            if (!random) {
                throw new DianaError(ErrorCode.Validation, `无法获取消息 ${sequence} 的 random，无法设置精华`);
            }
            if (action === 'set_essence_msg') {
                await ctx.essence.set(groupUin, sequence, random);
            } else {
                await ctx.essence.unset(groupUin, sequence, random);
            }
            return ok(null);
        }
        case 'send_group_sign': {
            const result = await ctx.group.clockIn(asNumber(params.group_id), ctx.selfId, ctx.appVersion);
            return ok(result);
        }
        case 'delete_friend': {
            const uid = await resolveUid(ctx, asNumber(params.user_id));
            await ctx.friend.deleteFriend(uid, Boolean(params.block ?? false));
            return ok(null);
        }
        case 'get_private_file_url':
            return ok({ url: '' });
        case 'get_group_file_system_info': {
            const groupUin = asNumber(params.group_id);
            const [count, space] = await Promise.all([ctx.groupFile.getFileCount(groupUin), ctx.groupFile.getSpace(groupUin)]);
            return ok({
                file_count: count.allCount,
                limit_count: count.limitCount,
                used_space: space.usedSpace,
                total_space: space.totalSpace,
            });
        }
        case 'get_group_root_files':
        case 'get_group_files_by_folder': {
            const groupUin = asNumber(params.group_id);
            const folderId =
                action === 'get_group_files_by_folder' ? String(params.folder_id ?? '/') : '/';
            const result = await ctx.groupFile.listFiles(groupUin, folderId);
            return ok({
                file_count: result.files.length + result.folders.length,
                total_limit: 0,
                used_space: 0,
                total_space: 0,
                files: result.files.map((file) => ({
                    file_id: file.fileId,
                    file_name: file.fileName,
                    bus_id: 102,
                    file_size: file.fileSize,
                    upload_time: file.uploadTime,
                    dead_time: file.deadTime,
                    modify_time: file.modifyTime,
                    download_times: file.downloadTimes,
                    uploader: String(file.uploaderUin),
                    uploader_id: file.uploaderUin,
                })),
                folders: result.folders.map((folder) => ({
                    folder_id: folder.folderId,
                    folder_name: folder.folderName,
                    create_time: folder.createTime,
                    creator: String(folder.createUin),
                    creator_id: folder.createUin,
                    total_file_count: folder.totalFileCount,
                })),
            });
        }
        case 'get_essence_msg_list': {
            const groupUin = asNumber(params.group_id);
            const { messages } = await ctx.essence.fetchList(groupUin);
            return ok(
                messages.map((item) => ({
                    group_id: item.groupUin,
                    message_seq: item.sequence,
                    message_random: item.random,
                    sender_id: item.senderUin,
                    sender_nick: item.senderNickname,
                    sender_time: item.senderTime,
                    operator_id: item.operatorUin,
                    operator_nick: item.operatorNickname,
                    operator_time: item.operatorTime,
                    message_content: item.content,
                })),
            );
        }
        case '_set_model_show':
        case 'set_model_show':
        case 'set_restart':
        case 'set_group_anonymous':
        case 'set_group_anonymous_ban':
            return ok(null);
        case '_get_model_show':
        case 'get_model_show':
            return ok({ variants: [] });
        case 'get_online_clients':
            return ok({ clients: [] });
        case 'get_guild_list':
            return ok([]);
        case 'get_guild_service_profile':
            return ok(null);
        case 'get_group_honor_info':
            return ok({
                group_id: asNumber(params.group_id),
                talkative_list: [],
                performer_list: [],
                legend_list: [],
                strong_newbie_list: [],
                emotion_list: [],
            });
        default:
            return fail(1404, `不支持的 action: ${action}`);
    }
}