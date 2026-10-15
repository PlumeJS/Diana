import { randomBytes, randomUUID } from 'node:crypto';
import { deflateSync, gunzipSync, gzipSync, inflateSync } from 'node:zlib';
import { MessageType } from '../common/message-type.js';
import { DianaError, ErrorCode } from '../common/errors.js';
import {
    LargeFaceInfo,
    LongMsgInterfaceReq,
    LongMsgInterfaceRsp,
    MentionExtra,
    MentionType,
    MessageElement,
    MsgInfo,
    PbMultiMsgTransmit,
    PbSendMsg,
    PbSendMsgResponse,
    PushMsg,
    PushMsgBody,
    PushMsgType,
    SmallExtraFaceInfo,
    SsoC2CRecallMsg,
    SsoGetC2CMsg,
    SsoGetC2CMsgResponse,
    SsoGetGroupMsg,
    SsoGetGroupMsgResponse,
    SsoGetPeerSeq,
    SsoGetPeerSeqResponse,
    SsoGetRoamMsg,
    SsoGetRoamMsgResponse,
    SsoGroupRecallMsg,
} from '../packet/message/index.js';
import type { CommonMessage, CustomFaceElement, IndexNode, NotOnlineImageElement } from '../packet/message/index.js';
import type { InferProtoModel, InferProtoModelInput } from '../pb/index.js';
import type { ProtocolOs } from '../common/app-info.js';
import { timestamp } from '../util/format.js';
import type { PushHandler, SsoTransport } from './transport.js';

/** 消息推送命令字。 */
export const MESSAGE_PUSH_COMMAND = 'trpc.msg.olpush.OlPushService.MsgPush';

/** 发送消息命令字。 */
export const SEND_MESSAGE_COMMAND = 'MessageSvc.PbSendMsg';

/** 群消息撤回命令字。 */
export const RECALL_GROUP_COMMAND = 'trpc.msg.msg_svc.MsgService.SsoGroupRecallMsg';

/** 私聊消息撤回命令字。 */
export const RECALL_PRIVATE_COMMAND = 'trpc.msg.msg_svc.MsgService.SsoC2CRecallMsg';

/** 拉取群历史消息命令字。 */
export const GET_GROUP_MESSAGES_COMMAND = 'trpc.msg.register_proxy.RegisterProxy.SsoGetGroupMsg';

/** 拉取私聊历史消息命令字。 */
export const GET_C2C_MESSAGES_COMMAND = 'trpc.msg.register_proxy.RegisterProxy.SsoGetC2cMsg';

/** 拉取漫游消息命令字。 */
export const GET_ROAM_MESSAGES_COMMAND = 'trpc.msg.register_proxy.RegisterProxy.SsoGetRoamMsg';

/** 拉取私聊最新消息序列号命令字。 */
export const GET_PEER_SEQUENCE_COMMAND = 'trpc.msg.msg_svc.MsgService.SsoGetPeerSeq';

/** 发送长消息（合并转发）命令字。 */
export const SEND_FORWARD_COMMAND = 'trpc.group.long_msg_interface.MsgService.SsoSendLongMsg';

/** 拉取长消息（合并转发）内容命令字。 */
export const FETCH_FORWARD_COMMAND = 'trpc.group.long_msg_interface.MsgService.SsoRecvLongMsg';

/** 合并转发节点。 */
export interface ForwardNode {
    /** 节点发送者 uin。 */
    uin: number;
    /** 节点发送者 uid，未知时省略。 */
    uid?: string;
    /** 节点发送者昵称，用于卡片预览。 */
    nickname: string;
    /** 时间戳（秒）。 */
    time: number;
    /** 节点内容。 */
    segments: OutgoingSegment[];
}

/** 合并转发卡片中的节点预览。 */
export interface ForwardPreview {
    /** 节点发送者昵称。 */
    nickname: string;
    /** 节点内容摘要。 */
    text: string;
}

/** 合并转发的发送目标。 */
export type ForwardTarget = { kind: 'group'; groupUin: number } | { kind: 'private'; uin: number; uid: string };

/** 合并转发 attr 子命令：发送 4、拉取 2（PC 端）。 */
const FORWARD_SEND_SUB_COMMAND = 4;
const FORWARD_RECV_SUB_COMMAND = 2;

/** 合并转发 attr 客户端类型（PC 端固定 1）。 */
const FORWARD_CLIENT_TYPE = 1;

/** 合并转发 attr 平台（对齐官方 Protocol 映射）。 */
const FORWARD_PLATFORM: Record<ProtocolOs, number> = { windows: 3, linux: 6 };

/** 合并转发内容类型：群聊 82、私聊 166。 */
const FORWARD_CONTENT_TYPE = { group: 82, private: 166 } as const;

/** 发送长消息 msgType：群聊 3、私聊 1（4 为 wpamsg、5 为群临时会话）。 */
const SEND_FORWARD_MSG_TYPE = { group: 3, private: 1 } as const;

/** 拉取长消息 msgType：群聊 1、私聊 3（与发送相反）。 */
const FETCH_FORWARD_MSG_TYPE = { group: 1, private: 3 } as const;

/** 撤回缓存上限。 */
const RECALL_CACHE_LIMIT = 512;

/** 写入有界缓存，超出上限时淘汰最早的条目。 */
function putBounded<K, V>(cache: Map<K, V>, key: K, value: V, limit: number): void {
    if (cache.size >= limit) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) {
            cache.delete(oldest);
        }
    }
    cache.set(key, value);
}

const NT_IMAGE_URL_BASE = 'https://multimedia.nt.qq.com.cn';
const LEGACY_IMAGE_URL_BASE = 'http://gchat.qpic.cn';

/** 图片子类型。 */
export enum ImageSubType {
    Picture = 0,
    Face = 1,
}

/** 文本消息段。 */
export interface TextSegment {
    type: 'text';
    content: string;
}

/** @ 提及消息段。 */
export interface MentionSegment {
    type: 'mention';
    uin: number;
    name: string;
    uid?: string;
}

/** 表情消息段。id ≥ 260 时为新版表情，需提供 detail（来自 SystemService.faceDetails）。 */
export interface FaceSegment {
    type: 'face';
    id: number;
    /** 是否以超级表情（大表情）发送。 */
    large?: boolean;
    /** 表情详情（qSid 对应的 FaceDetail 关键字段）。 */
    detail?: { qDes?: string; aniStickerType?: number; aniStickerPackId?: number; aniStickerId?: number };
}

/** NT 富媒体信息：服务端返回的原始字节（推荐，原样透传）或已解码结构。 */
export type MsgInfoInput = Buffer | InferProtoModelInput<typeof MsgInfo.fields>;

/** 图片消息段（NT 富媒体，可附兼容旧版元素）。 */
export interface ImageSegment {
    type: 'image';
    msgInfo: MsgInfoInput;
    /** 兼容旧版元素：`CompatQMsg` 原始字节或已解码结构。 */
    compatImage?: Buffer | InferProtoModelInput<typeof NotOnlineImageElement.fields>;
    compatFace?: Buffer | InferProtoModelInput<typeof CustomFaceElement.fields>;
}

/** 语音消息段（NT 富媒体）。 */
export interface RecordSegment {
    type: 'record';
    msgInfo: MsgInfoInput;
}

/** LightApp 消息段（小程序 / JSON 卡片）。 */
export interface LightAppSegment {
    type: 'lightApp';
    /** JSON 字符串载荷。 */
    payload: string;
}

/** 视频消息段（NT 富媒体）。 */
export interface VideoSegment {
    type: 'video';
    msgInfo: MsgInfoInput;
}

/** 出站消息段。 */
export type OutgoingSegment =
    | TextSegment
    | MentionSegment
    | FaceSegment
    | ImageSegment
    | RecordSegment
    | LightAppSegment
    | VideoSegment;

/** 引用信息。 */
export interface ReplyInfo {
    sequence: number;
    senderUin: number;
    senderUid?: string;
    senderName?: string;
    time?: number;
    messageUid?: bigint;
    elements?: Buffer[];
}

/** 入站文本消息段。 */
export interface IncomingTextSegment {
    type: 'text';
    content: string;
}

/** 入站 @ 消息段。 */
export interface IncomingMentionSegment {
    type: 'mention';
    uin: number;
    name: string;
}

/** 入站表情消息段。 */
export interface IncomingFaceSegment {
    type: 'face';
    id: number;
    summary?: string;
}

/** 入站图片消息段。 */
export interface IncomingImageSegment {
    type: 'image';
    width: number;
    height: number;
    subType: number;
    summary: string;
    /** 旧版元素的原始下载路径（rkey 可能过期）；NT 图片为空。 */
    url?: string;
    /** NT 图片的索引节点，可用 `MediaService.get*DownloadUrl` 现场换取带新鲜 rkey 的 URL。 */
    indexNode?: InferProtoModel<typeof IndexNode.fields>;
}

/** 入站语音消息段。 */
export interface IncomingRecordSegment {
    type: 'record';
    indexNode: InferProtoModel<typeof IndexNode.fields>;
}

/** 入站 LightApp 消息段。 */
export interface IncomingLightAppSegment {
    type: 'lightApp';
    payload: string;
}

/** 入站合并转发消息段。 */
export interface IncomingForwardSegment {
    type: 'forward';
    /** 合并转发内容 id（resid），可用 `fetchForwardPreviews` 拉取内容。 */
    resId: string;
}

/** 入站视频消息段。 */
export interface IncomingVideoSegment {
    type: 'video';
    indexNode: InferProtoModel<typeof IndexNode.fields>;
}

/** 入站消息段。 */
export type IncomingSegment =
    | IncomingTextSegment
    | IncomingMentionSegment
    | IncomingFaceSegment
    | IncomingImageSegment
    | IncomingRecordSegment
    | IncomingLightAppSegment
    | IncomingForwardSegment
    | IncomingVideoSegment;

/** 入站消息。 */
export interface IncomingMessage {
    type: MessageType;
    time: number;
    senderUin: number;
    targetUin: number;
    senderUid?: string;
    senderName: string;
    groupUin?: number;
    sequence: number;
    repliedSequence?: number;
    /** 消息唯一 id（contentHead.msgUid），回复时写入 srcMsg.pbReserve。 */
    messageUid?: bigint;
    /** 原始富文本元素，回复时作为 srcMsg.elems 原样回传。 */
    elements?: Buffer[];
    segments: IncomingSegment[];
}

/** 发送私聊消息的参数。 */
export interface SendPrivateOptions {
    uin: number;
    uid?: string;
    segments: OutgoingSegment[];
    reply?: ReplyInfo;
}

/** 发送群消息的参数。 */
export interface SendGroupOptions {
    groupUin: number;
    segments: OutgoingSegment[];
    reply?: ReplyInfo;
}

/** 发送结果。 */
export interface SendResult {
    sequence: number;
    timestamp: number;
}

/** 撤回消息所需的上下文。 */
type RecallEntry =
    | { kind: 'group'; groupUin: number }
    | { kind: 'private'; uin: number; clientSequence: number; random: number; timestamp: number };

/** 消息推送处理器。 */
export type MessageHandler = (message: IncomingMessage) => void;

type ElementInput = InferProtoModelInput<typeof MessageElement.fields>;

/** 归一化 NT 富媒体信息：已是字节时原样透传，避免解码-重编码丢失未建模字段。 */
function encodeMsgInfo(msgInfo: MsgInfoInput): Buffer {
    return Buffer.isBuffer(msgInfo) ? msgInfo : MsgInfo.encode(msgInfo);
}

function randomUInt32(): number {
    return randomBytes(4).readUInt32BE(0);
}

function toElements(segment: OutgoingSegment, type: MessageType): ElementInput[] {
    switch (segment.type) {
        case 'text':
            return [{ text: { str: segment.content } }];
        case 'mention':
            return [
                {
                    text: {
                        str: `@${segment.name}`,
                        pbReserve: MentionExtra.encode({
                            type: segment.uin === 0 ? MentionType.All : MentionType.Someone,
                            uin: segment.uin,
                            field5: 0,
                            uid: segment.uid ?? '',
                        }),
                    },
                },
            ];
        case 'face': {
            // 对齐 acidify MessageBuildingContext.build(Face)：经典表情走 Elem.face，
            // faceId≥260 的新版表情按大/小分别走 CommonElem serviceType 37/33
            if (segment.id >= 260 && segment.detail) {
                if (segment.large) {
                    return [
                        {
                            common: {
                                serviceType: 37,
                                pbElement: LargeFaceInfo.encode({
                                    aniStickerPackId: String(segment.detail.aniStickerPackId ?? 0),
                                    aniStickerId: String(segment.detail.aniStickerId ?? 0),
                                    faceId: segment.id,
                                    field4: 1,
                                    aniStickerType: segment.detail.aniStickerType ?? 0,
                                    field6: '',
                                    preview: segment.detail.qDes ?? '',
                                    field9: 1,
                                }),
                                businessType: segment.detail.aniStickerType ?? 0,
                            },
                        },
                    ];
                }
                const qDes = segment.detail.qDes ?? '';
                return [
                    {
                        common: {
                            serviceType: 33,
                            pbElement: SmallExtraFaceInfo.encode({
                                faceId: segment.id,
                                text1: qDes,
                                text2: qDes,
                            }),
                            businessType: segment.detail.aniStickerType ?? 0,
                        },
                    },
                ];
            }
            return [{ face: { index: segment.id } }];
        }
        case 'image':
            return [
                { notOnlineImage: segment.compatImage, customFace: segment.compatFace },
                {
                    common: {
                        serviceType: 48,
                        pbElement: encodeMsgInfo(segment.msgInfo),
                        // 群聊 20、私聊 10，与官方 ImageEntity.Build 一致
                        businessType: type === MessageType.GroupMessage ? 20 : 10,
                    },
                },
            ];
        case 'record':
            return [
                {
                    common: {
                        serviceType: 48,
                        pbElement: encodeMsgInfo(segment.msgInfo),
                        // 群聊 22、私聊 12，与官方 RecordEntity.Build 一致
                        businessType: type === MessageType.GroupMessage ? 22 : 12,
                    },
                },
            ];
        case 'lightApp':
            // 载荷为 0x01 前缀 + zlib(JSON)，与官方 LightAppEntity 一致
            return [{ lightApp: { bytesData: Buffer.concat([Buffer.from([0x01]), deflateSync(segment.payload)]) } }];
        case 'video':
            return [
                {
                    common: {
                        serviceType: 48,
                        pbElement: encodeMsgInfo(segment.msgInfo),
                        // 群聊 21、私聊 11，与官方 VideoEntity.Build 一致
                        businessType: type === MessageType.GroupMessage ? 21 : 11,
                    },
                },
            ];
    }
}

function toReplyElements(reply: ReplyInfo, type: MessageType): ElementInput[] {
    const srcMsg: ElementInput = {
        srcMsg: {
            origSeqs: [reply.sequence],
            senderUin: reply.senderUin,
            time: reply.time ?? timestamp(),
            flag: 0,
            elems: reply.elements ?? [],
            pbReserve: {
                oriMsgType: 2,
                messageId: reply.messageUid ?? 0n,
                senderUid: reply.senderUid,
            },
            toUin: 0,
        },
    };
    if (type === MessageType.PrivateMessage) {
        return [srcMsg];
    }
    return [
        srcMsg,
        {
            text: {
                str: `@${reply.senderName ?? ''}`,
                pbReserve: MentionExtra.encode({
                    type: MentionType.Someone,
                    uin: reply.senderUin,
                    field5: 0,
                    uid: reply.senderUid ?? '',
                }),
            },
        },
        { text: { str: ' ' } },
    ];
}

function buildElements(segments: OutgoingSegment[], reply: ReplyInfo | undefined, type: MessageType): Buffer[] {
    const elements: ElementInput[] = [];
    if (reply) {
        elements.push(...toReplyElements(reply, type));
    }
    for (const segment of segments) {
        elements.push(...toElements(segment, type));
    }
    return elements.map((element) => MessageElement.encode(element));
}

function parseText(element: InferProtoModel<typeof MessageElement.fields>): IncomingSegment | undefined {
    const text = element.text;
    if (!text) {
        return undefined;
    }
    if (text.attr6Buf && text.attr6Buf.length >= 11) {
        return { type: 'mention', name: text.str ?? '', uin: text.attr6Buf.readUInt32BE(7) };
    }
    return { type: 'text', content: text.str ?? '' };
}

function resolveImageUrl(origUrl: string): string {
    return origUrl.includes('&fileid=') ? `${NT_IMAGE_URL_BASE}${origUrl}` : `${LEGACY_IMAGE_URL_BASE}${origUrl}`;
}

function parseCommon(element: InferProtoModel<typeof MessageElement.fields>): IncomingSegment | undefined {
    const common = element.common;
    if (!common) {
        return undefined;
    }
    if (common.serviceType === 37) {
        const info = LargeFaceInfo.decode(common.pbElement);
        return { type: 'face', id: info.faceId, summary: info.preview };
    }
    if (common.serviceType === 33) {
        const info = SmallExtraFaceInfo.decode(common.pbElement);
        return { type: 'face', id: info.faceId, summary: info.text1 ?? info.text2 };
    }
    if (common.serviceType === 48) {
        if (common.businessType === 20 || common.businessType === 10) {
            const msgInfo = MsgInfo.decode(common.pbElement);
            const body = msgInfo.msgInfoBody[0];
            if (body) {
                return {
                    type: 'image',
                    width: body.index?.info?.width ?? 0,
                    height: body.index?.info?.height ?? 0,
                    subType: msgInfo.extBizInfo?.pic?.bizType ?? ImageSubType.Picture,
                    summary: msgInfo.extBizInfo?.pic?.textSummary || '[图片]',
                    indexNode: body.index,
                };
            }
        } else if (common.businessType === 22 || common.businessType === 12) {
            const msgInfo = MsgInfo.decode(common.pbElement);
            const body = msgInfo.msgInfoBody[0];
            if (body) {
                return { type: 'record', indexNode: body.index };
            }
        } else if (common.businessType === 21 || common.businessType === 11) {
            const msgInfo = MsgInfo.decode(common.pbElement);
            const body = msgInfo.msgInfoBody[0];
            if (body) {
                return { type: 'video', indexNode: body.index };
            }
        }
    }
    return undefined;
}

function parseLegacyImage(element: InferProtoModel<typeof MessageElement.fields>): IncomingSegment | undefined {
    const image = element.notOnlineImage;
    if (image?.origUrl) {
        return {
            type: 'image',
            url: resolveImageUrl(image.origUrl),
            width: image.picWidth,
            height: image.picHeight,
            subType: image.pbRes?.subType ?? ImageSubType.Picture,
            summary: image.pbRes?.summary || '[图片]',
        };
    }
    const face = element.customFace;
    if (face?.origUrl) {
        return {
            type: 'image',
            url: resolveImageUrl(face.origUrl),
            width: face.width,
            height: face.height,
            subType: face.pbReserve?.subType ?? ImageSubType.Picture,
            summary: face.pbReserve?.summary || '[动画表情]',
        };
    }
    return undefined;
}

function parseElement(element: InferProtoModel<typeof MessageElement.fields>): IncomingSegment | undefined {
    const text = parseText(element);
    if (text) {
        return text;
    }
    const face = element.face;
    if (face?.old) {
        return { type: 'face', id: face.index ?? 0 };
    }
    return parseCommon(element) ?? parseLegacyImage(element) ?? parseLightApp(element);
}

/** 从 `com.tencent.multimsg` 卡片中提取 resid，非合并转发返回 undefined。 */
function forwardResId(payload: string): string | undefined {
    try {
        const card = JSON.parse(payload) as { app?: string; meta?: { detail?: { resid?: string } } };
        return card.app === 'com.tencent.multimsg' ? card.meta?.detail?.resid || undefined : undefined;
    } catch {
        return undefined;
    }
}

/** 解析 LightApp 元素（前缀 `0x01` 为 zlib、`0x00` 为原始 JSON）；合并转发卡片映射为 `forward` 段。 */
function parseLightApp(element: InferProtoModel<typeof MessageElement.fields>): IncomingSegment | undefined {
    const data = element.lightApp?.bytesData;
    if (!data || data.length === 0) {
        return undefined;
    }
    let payload: string;
    try {
        payload = data[0] === 1 ? inflateSync(data.subarray(1)).toString('utf8') : data.subarray(1).toString('utf8');
    } catch {
        return undefined;
    }
    const resId = forwardResId(payload);
    return resId ? { type: 'forward', resId } : { type: 'lightApp', payload };
}

/** 解析消息推送体为入站消息。 */
export function parseIncomingMessage(body: Buffer): IncomingMessage | undefined {
    return parsePushMessage(PushMsgBody.decode(PushMsg.decode(body).message));
}

/** 解析单条消息体（推送与历史消息共用）。 */
export function parsePushMessage(message: InferProtoModel<typeof PushMsgBody.fields>): IncomingMessage | undefined {
    const contentType = message.contentHead.type;
    if (
        contentType !== PushMsgType.PrivateMessage &&
        contentType !== PushMsgType.GroupMessage &&
        contentType !== PushMsgType.TempMessage
    ) {
        return undefined;
    }

    const segments: IncomingSegment[] = [];
    let repliedSequence: number | undefined;
    const rawElements = message.body?.richText?.elements ?? [];
    for (const raw of rawElements) {
        const element = MessageElement.decode(raw);
        const srcMsg = element.srcMsg;
        if (!repliedSequence && srcMsg) {
            repliedSequence = srcMsg.pbReserve?.friendSequence ?? srcMsg.origSeqs?.[0];
            continue;
        }
        const segment = parseElement(element);
        if (segment) {
            // 一张图片会同时携带兼容元素（notOnlineImage/customFace）与 NT 元素（common 48），
            // 仅保留 NT 段，避免同一张图被拆成两个段
            const previous = segments[segments.length - 1];
            if (
                segment.type === 'image' && segment.indexNode &&
                previous?.type === 'image' && !previous.indexNode
            ) {
                segments[segments.length - 1] = segment;
            } else {
                segments.push(segment);
            }
        }
    }
    if (segments.length === 0) {
        return undefined;
    }

    const head = message.responseHead;
    const group = head.groupExt;
    return {
        type: group ? MessageType.GroupMessage : MessageType.PrivateMessage,
        time: message.contentHead.timestamp,
        senderUin: head.fromUin,
        targetUin: head.toUin,
        senderUid: head.fromUid,
        senderName: group ? group.memberName : (head.friendExt?.friendName ?? ''),
        groupUin: group?.groupUin,
        sequence: group ? (message.contentHead.sequence ?? 0) : (message.contentHead.ntMsgSeq ?? 0),
        repliedSequence,
        messageUid: message.contentHead.msgUid,
        elements: rawElements,
        segments,
    };
}

/** 解析历史消息列表。 */
function parseHistory(messages: InferProtoModel<typeof PushMsgBody.fields>[] | undefined): IncomingMessage[] {
    const parsed: IncomingMessage[] = [];
    for (const message of messages ?? []) {
        const incoming = parsePushMessage(message);
        if (incoming) {
            parsed.push(incoming);
        }
    }
    return parsed;
}

/** 合并转发卡片中的出站节点内容摘要。 */
function previewSegment(segment: OutgoingSegment): string {
    switch (segment.type) {
        case 'text':
            return segment.content;
        case 'mention':
            return `@${segment.name}`;
        case 'face':
            return '[表情]';
        case 'image':
            return '[图片]';
        case 'record':
            return '[语音]';
        case 'video':
            return '[视频]';
        case 'lightApp':
            return '[聊天记录]';
    }
}

/** 合并转发卡片中的入站节点内容摘要。 */
function previewIncomingSegment(segment: IncomingSegment): string {
    switch (segment.type) {
        case 'text':
            return segment.content;
        case 'mention':
            return `@${segment.name}`;
        case 'face':
            return '[表情]';
        case 'image':
            return '[图片]';
        case 'record':
            return '[语音]';
        case 'video':
            return '[视频]';
        case 'lightApp':
            return '[聊天记录]';
        case 'forward':
            return '[聊天记录]';
    }
}

/** 由发送节点生成卡片预览。 */
export function forwardPreviews(nodes: ForwardNode[]): ForwardPreview[] {
    return nodes.map((node) => ({ nickname: node.nickname, text: node.segments.map(previewSegment).join(' ') }));
}

/** 合并转发内容中的节点。 */
export interface ForwardMessageNode {
    /** 节点发送者 uin。 */
    uin: number;
    /** 节点发送者昵称。 */
    nickname: string;
    /** 时间戳（秒）。 */
    time: number;
    /** 节点内容。 */
    segments: IncomingSegment[];
}

/** 从 `PbMultiMsgTransmit` 载荷解析转发节点。 */
function parseForwardNodes(payload: Buffer): ForwardMessageNode[] {
    const item = PbMultiMsgTransmit.decode(payload).items.find((entry) => entry.fileName === 'MultiMsg');
    return (item?.buffer?.msg ?? []).map((message) => {
        const routingHead = message.routingHead;
        const segments: IncomingSegment[] = [];
        for (const raw of message.body?.richText?.elements ?? []) {
            const segment = parseElement(MessageElement.decode(raw));
            if (segment) {
                segments.push(segment);
            }
        }
        return {
            uin: Number(routingHead?.fromUin ?? 0n),
            nickname:
                routingHead?.groupExt?.groupCard || routingHead?.c2cExt?.name || String(routingHead?.fromUin ?? ''),
            time: message.contentHead?.timestamp ?? 0,
            segments,
        };
    });
}

/** 从 `PbMultiMsgTransmit` 载荷解析节点预览。 */
function parseForwardPreviews(payload: Buffer): ForwardPreview[] {
    return parseForwardNodes(payload).map((node) => ({
        nickname: node.nickname,
        text: node.segments.map(previewIncomingSegment).join(' '),
    }));
}

/**
 * 构造 `com.tencent.multimsg` 卡片载荷（对齐官方 `MultiMsgEntity.Build`）。
 * 卡片仅展示前 4 个节点的预览，真实内容由客户端按 `resid` 拉取。
 */
export function buildForwardCard(resId: string, previews: ForwardPreview[]): string {
    const count = Math.min(previews.length, 4);
    const guid = randomUUID();
    return JSON.stringify({
        app: 'com.tencent.multimsg',
        config: { autosize: 1, forward: 1, round: 1, type: 'normal', width: 300 },
        desc: '[聊天记录]',
        meta: {
            detail: {
                news: previews.slice(0, count).map((preview) => ({ text: `${preview.nickname}: ${preview.text}` })),
                resid: resId,
                source: '聊天记录',
                summary: `查看${count}条转发消息`,
                uniseq: guid,
            },
        },
        extra: JSON.stringify({ filename: guid, tsum: count }),
        prompt: '[聊天记录]',
        ver: '0.0.0.5',
        view: 'contact',
    });
}

/** 消息收发服务。 */
export class MessageService {
    private readonly handlers = new Set<MessageHandler>();
    private readonly pushHandler: PushHandler;
    private readonly recallCache = new Map<number, RecallEntry>();
    private readonly incomingCache = new Map<number, IncomingMessage>();
    private clientSequence = 0;

    constructor(
        private readonly transport: SsoTransport,
        private readonly os: ProtocolOs = 'windows',
    ) {
        this.pushHandler = (packet) => {
            if (packet.command !== MESSAGE_PUSH_COMMAND) {
                return;
            }
            const message = parseIncomingMessage(packet.body);
            if (message) {
                putBounded(this.incomingCache, message.sequence, message, RECALL_CACHE_LIMIT);
                if (message.type === MessageType.GroupMessage && message.groupUin !== undefined) {
                    this.remember(message.sequence, { kind: 'group', groupUin: message.groupUin });
                }
                for (const handler of this.handlers) {
                    handler(message);
                }
            }
        };
        this.transport.onPush(this.pushHandler);
    }

    /** 注册消息处理器。 */
    onMessage(handler: MessageHandler): void {
        this.handlers.add(handler);
    }

    /** 移除消息处理器。 */
    offMessage(handler: MessageHandler): void {
        this.handlers.delete(handler);
    }

    /** 解析回复目标（依据入站消息缓存），未命中时返回 undefined。 */
    resolveReply(sequence: number): ReplyInfo | undefined {
        const entry = this.incomingCache.get(sequence);
        if (!entry) {
            return undefined;
        }
        return {
            sequence,
            senderUin: entry.senderUin,
            senderUid: entry.senderUid,
            senderName: entry.senderName,
            time: entry.time,
            messageUid: entry.messageUid,
            elements: entry.elements,
        };
    }

    /** 读取缓存的入站消息（`get_msg` 用）。 */
    getCachedMessage(sequence: number): IncomingMessage | undefined {
        return this.incomingCache.get(sequence);
    }

    /** 清空消息缓存。 */
    clearCaches(): void {
        this.incomingCache.clear();
        this.recallCache.clear();
    }

    /** 释放推送监听。 */
    dispose(): void {
        this.transport.offPush(this.pushHandler);
        this.handlers.clear();
        this.incomingCache.clear();
    }

    /** 发送私聊消息。 */
    async sendPrivateMessage(options: SendPrivateOptions): Promise<SendResult> {
        const clientSequence = this.nextClientSequence();
        const random = randomUInt32();
        const result = await this.send({
            routingHead: { c2cExt: { uin: options.uin, uid: options.uid } },
            contentHead: { type: 1, subType: 0, c2cCmd: 0 },
            body: { richText: { elements: buildElements(options.segments, options.reply, MessageType.PrivateMessage) } },
            clientSequence,
            random,
            control: { msgFlag: timestamp() },
        });
        this.remember(result.sequence, {
            kind: 'private',
            uin: options.uin,
            clientSequence,
            random,
            timestamp: result.timestamp,
        });
        return result;
    }

    /** 发送群消息。 */
    async sendGroupMessage(options: SendGroupOptions): Promise<SendResult> {
        const result = await this.send({
            routingHead: { groupExt: { groupCode: options.groupUin } },
            contentHead: { type: 1, subType: 0, c2cCmd: 0 },
            body: { richText: { elements: buildElements(options.segments, options.reply, MessageType.GroupMessage) } },
            clientSequence: this.nextClientSequence(),
            random: randomUInt32(),
        });
        this.remember(result.sequence, { kind: 'group', groupUin: options.groupUin });
        return result;
    }

    /**
     * 上传合并转发内容，返回 resid。
     * 需再调用 `buildForwardCard` 生成卡片，作为 `lightApp` 段随普通消息发送。
     */
    async uploadForward(target: ForwardTarget, nodes: ForwardNode[]): Promise<string> {
        if (nodes.length === 0) {
            throw new DianaError(ErrorCode.Validation, '合并转发至少需要一个节点');
        }
        const payload = PbMultiMsgTransmit.encode({
            items: [{ fileName: 'MultiMsg', buffer: { msg: nodes.map((node) => this.buildFakeMessage(node, target)) } }],
        });
        const reply = await this.transport.send(
            SEND_FORWARD_COMMAND,
            LongMsgInterfaceReq.encode({
                sendReq: {
                    msgType: SEND_FORWARD_MSG_TYPE[target.kind],
                    // 官方群聊的 uid 即群号字符串
                    peerInfo: { peerUid: target.kind === 'private' ? target.uid : String(target.groupUin) },
                    groupUin: target.kind === 'group' ? BigInt(target.groupUin) : 0n,
                    payload: gzipSync(payload),
                },
                attr: {
                    subCmd: FORWARD_SEND_SUB_COMMAND,
                    clientType: FORWARD_CLIENT_TYPE,
                    platform: FORWARD_PLATFORM[this.os],
                    proxyType: 0,
                },
            }),
        );
        if (!('body' in reply)) {
            throw new DianaError(ErrorCode.Protocol, `发送合并转发失败 (retcode=${reply.retcode}): ${reply.extra}`);
        }
        const resId = LongMsgInterfaceRsp.decode(reply.body).sendRsp?.resId;
        if (!resId) {
            throw new DianaError(ErrorCode.Protocol, '发送合并转发失败：响应缺少 resid');
        }
        return resId;
    }

    /** 拉取已存在的合并转发内容预览，用于重新转发（`forward` 段）。 */
    async fetchForwardPreviews(target: ForwardTarget, resId: string): Promise<ForwardPreview[]> {
        const payload = await this.fetchForwardPayload(target, resId);
        return parseForwardPreviews(payload);
    }

    /** 拉取已存在的合并转发完整内容（`get_forward_msg` 用）。 */
    async fetchForwardMessages(target: ForwardTarget, resId: string): Promise<ForwardMessageNode[]> {
        return parseForwardNodes(await this.fetchForwardPayload(target, resId));
    }

    /** 拉取合并转发内容（gzip 压缩的 `PbMultiMsgTransmit`）。 */
    private async fetchForwardPayload(target: ForwardTarget, resId: string): Promise<Buffer> {
        const reply = await this.transport.send(
            FETCH_FORWARD_COMMAND,
            LongMsgInterfaceReq.encode({
                recvReq: {
                    // 拉取时 PeerUid 为请求方（自己）的 uid
                    peerInfo: { peerUid: this.transport.session.uid ?? '' },
                    resId,
                    msgType: FETCH_FORWARD_MSG_TYPE[target.kind],
                },
                attr: {
                    subCmd: FORWARD_RECV_SUB_COMMAND,
                    clientType: FORWARD_CLIENT_TYPE,
                    platform: FORWARD_PLATFORM[this.os],
                    proxyType: 0,
                },
            }),
        );
        if (!('body' in reply)) {
            throw new DianaError(ErrorCode.Protocol, `拉取合并转发失败 (retcode=${reply.retcode}): ${reply.extra}`);
        }
        const payload = LongMsgInterfaceRsp.decode(reply.body).recvRsp?.payload;
        if (!payload) {
            throw new DianaError(ErrorCode.Protocol, '拉取合并转发失败：响应缺少内容');
        }
        return gunzipSync(payload);
    }

    /** 构造合并转发中的节点消息（对齐官方 `MessagePacker.BuildFake`）。 */
    private buildFakeMessage(node: ForwardNode, target: ForwardTarget): InferProtoModelInput<typeof CommonMessage.fields> {
        const isGroup = target.kind === 'group';
        const random = randomUInt32();
        return {
            routingHead: {
                fromUin: BigInt(node.uin),
                fromUid: node.uid ?? '',
                ...(target.kind === 'group'
                    ? {
                          groupExt: {
                              groupCode: BigInt(target.groupUin),
                              groupCard: node.nickname,
                              // 2 表示群名片（官方固定值）
                              groupCardType: 2,
                          },
                      }
                    : { c2cExt: { name: node.nickname }, toUin: BigInt(target.uin), toUid: target.uid }),
            },
            contentHead: {
                type: isGroup ? FORWARD_CONTENT_TYPE.group : FORWARD_CONTENT_TYPE.private,
                random,
                sequence: 0,
                timestamp: node.time,
                ntMsgSeq: 0,
                msgUid: (0x01000000n << 32n) | BigInt(random),
            },
            body: {
                richText: {
                    elements: buildElements(node.segments, undefined, isGroup ? MessageType.GroupMessage : MessageType.PrivateMessage),
                },
            },
        };
    }

    /** 撤回群消息。 */
    async recallGroupMessage(groupUin: number, sequence: number): Promise<void> {
        await this.callCommand(RECALL_GROUP_COMMAND, SsoGroupRecallMsg.encode({ type: 1, groupUin, info: { sequence } }));
    }

    /** 撤回私聊消息。 */
    async recallPrivateMessage(
        uid: string,
        clientSequence: number,
        random: number,
        timestamp: number,
        ntMsgSeq: number,
    ): Promise<void> {
        await this.callCommand(
            RECALL_PRIVATE_COMMAND,
            SsoC2CRecallMsg.encode({
                type: 1,
                targetUid: uid,
                info: {
                    clientSequence,
                    random,
                    messageUid: (0x01000000n << 32n) | BigInt(random),
                    timestamp,
                    field5: 0,
                    ntMsgSeq,
                },
                field5: { field1: 0, field2: 0 },
                field6: 0,
            }),
        );
    }

    /** 撤回消息（依据缓存的发送/接收上下文自动区分群聊与私聊）。 */
    async recallMessage(sequence: number, resolveUid: (uin: number) => Promise<string>): Promise<void> {
        const entry = this.recallCache.get(sequence);
        if (!entry) {
            throw new DianaError(ErrorCode.Validation, `无法撤回消息 ${sequence}：缺少发送上下文`);
        }
        if (entry.kind === 'group') {
            await this.recallGroupMessage(entry.groupUin, sequence);
            return;
        }
        const uid = await resolveUid(entry.uin);
        await this.recallPrivateMessage(uid, entry.clientSequence, entry.random, entry.timestamp, sequence);
    }

    /** 拉取群历史消息（startSequence 到 endSequence 闭区间）。 */
    async fetchGroupMessages(groupUin: number, startSequence: number, endSequence: number): Promise<IncomingMessage[]> {
        const reply = await this.transport.send(
            GET_GROUP_MESSAGES_COMMAND,
            SsoGetGroupMsg.encode({
                info: {
                    groupUin: BigInt(groupUin),
                    startSequence: BigInt(startSequence),
                    endSequence: BigInt(endSequence),
                },
                filter: 1,
            }),
        );
        if (!('body' in reply)) {
            throw new DianaError(ErrorCode.Protocol, `拉取群历史消息失败 (retcode=${reply.retcode}): ${reply.extra}`);
        }
        return parseHistory(SsoGetGroupMsgResponse.decode(reply.body).body?.messages);
    }

    /** 拉取私聊历史消息（startSequence 到 endSequence 闭区间）。 */
    async fetchC2CMessages(uid: string, startSequence: number, endSequence: number): Promise<IncomingMessage[]> {
        const reply = await this.transport.send(
            GET_C2C_MESSAGES_COMMAND,
            SsoGetC2CMsg.encode({
                peerUid: uid,
                startSequence: BigInt(startSequence),
                endSequence: BigInt(endSequence),
            }),
        );
        if (!('body' in reply)) {
            throw new DianaError(ErrorCode.Protocol, `拉取私聊历史消息失败 (retcode=${reply.retcode}): ${reply.extra}`);
        }
        return parseHistory(SsoGetC2CMsgResponse.decode(reply.body).messages);
    }

    /** 拉取漫游消息（count 上限 30，direction 1 向上、2 向下）。 */
    async fetchRoamMessages(uid: string, time: number, count: number, direction = 2): Promise<IncomingMessage[]> {
        const reply = await this.transport.send(
            GET_ROAM_MESSAGES_COMMAND,
            SsoGetRoamMsg.encode({ peerUid: uid, time, random: 0, count, direction }),
        );
        if (!('body' in reply)) {
            throw new DianaError(ErrorCode.Protocol, `拉取漫游消息失败 (retcode=${reply.retcode}): ${reply.extra}`);
        }
        return parseHistory(SsoGetRoamMsgResponse.decode(reply.body).messages);
    }

    /** 拉取私聊最新消息序列号。 */
    async fetchC2CLatestSequence(uid: string): Promise<number> {
        const reply = await this.transport.send(GET_PEER_SEQUENCE_COMMAND, SsoGetPeerSeq.encode({ peerUid: uid }));
        if (!('body' in reply)) {
            throw new DianaError(ErrorCode.Protocol, `拉取私聊最新序列号失败 (retcode=${reply.retcode}): ${reply.extra}`);
        }
        const response = SsoGetPeerSeqResponse.decode(reply.body);
        const seq1 = response.seq1 ?? 0n;
        const seq2 = response.seq2 ?? 0n;
        return Number(seq1 > seq2 ? seq1 : seq2);
    }

    private async callCommand(command: string, body: Buffer): Promise<void> {
        const reply = await this.transport.send(command, body);
        if (!('body' in reply)) {
            throw new DianaError(ErrorCode.Protocol, `请求失败 (cmd=${command}, retcode=${reply.retcode}): ${reply.extra}`);
        }
    }

    private remember(sequence: number, entry: RecallEntry): void {
        putBounded(this.recallCache, sequence, entry, RECALL_CACHE_LIMIT);
    }

    private async send(input: InferProtoModelInput<typeof PbSendMsg.fields>): Promise<SendResult> {
        const response = await this.transport.send(SEND_MESSAGE_COMMAND, PbSendMsg.encode(input));
        if (!('body' in response)) {
            throw new DianaError(ErrorCode.Protocol, `发送消息失败 (retcode=${response.retcode}): ${response.extra}`);
        }
        const parsed = PbSendMsgResponse.decode(response.body);
        if (parsed.resultCode !== 0) {
            throw new DianaError(ErrorCode.Protocol, `发送消息失败 (resultCode=${parsed.resultCode}): ${parsed.errMsg}`);
        }
        return {
            sequence: parsed.groupSequence ?? parsed.privateSequence,
            timestamp: parsed.timestamp1,
        };
    }

    private nextClientSequence(): number {
        this.clientSequence += 1;
        return this.clientSequence;
    }
}