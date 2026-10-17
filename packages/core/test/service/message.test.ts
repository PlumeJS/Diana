import { createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { deflateSync, gunzipSync, gzipSync, inflateSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { LINUX_APP_INFO } from '../../src/common/app-info.js';
import { newDeviceInfo } from '../../src/common/device-info.js';
import { MessageType } from '../../src/common/message-type.js';
import { decryptTea, encryptTea } from '../../src/crypto/tea.js';
import {
    CompressionType,
    EMPTY_TEA_KEY,
    EncryptionType,
    encodeSsoFrame,
    incomingSsoPacketSchema,
    incomingSsoPacketWrapperSchema,
    outgoingSsoPacketSchema,
    outgoingSsoPacketWrapperSchema,
    SSO_PROTOCOL,
    SsoFrameReader,
} from '../../src/packet/index.js';
import {
    CustomFaceElement,
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
    SsoC2CRecallMsg,
    SsoGetC2CMsgResponse,
    SsoGetGroupMsgResponse,
    SsoGroupRecallMsg,
} from '../../src/packet/message/index.js';
import {
    buildForwardCard,
    FETCH_FORWARD_COMMAND,
    forwardPreviews,
    GET_C2C_MESSAGES_COMMAND,
    GET_GROUP_MESSAGES_COMMAND,
    MESSAGE_PUSH_COMMAND,
    MessageService,
    parseIncomingMessage,
    RECALL_GROUP_COMMAND,
    RECALL_PRIVATE_COMMAND,
    SEND_FORWARD_COMMAND,
    SEND_MESSAGE_COMMAND,
    SsoTransport,
} from '../../src/service/index.js';
import type { ForwardNode, IncomingMessage, SignProvider } from '../../src/service/index.js';
import { decodeTlv, encodeTlv } from '../../src/tlv/index.js';
import type { TlvData } from '../../src/tlv/index.js';

function parseOutgoing(frame: Buffer): { command: string; sequence: number; body: Buffer } {
    const wrapper = decodeTlv(outgoingSsoPacketWrapperSchema, frame);
    const inner = decodeTlv(outgoingSsoPacketSchema, decryptTea(wrapper['encrypted'] as Buffer, EMPTY_TEA_KEY));
    const header = inner['header'] as TlvData;
    return {
        command: header['command'] as string,
        sequence: header['sequence'] as number,
        body: inner['body'] as Buffer,
    };
}

function buildIncoming(command: string, sequence: number, body: Buffer): Buffer {
    const inner = encodeTlv(incomingSsoPacketSchema, {
        header: {
            sequence,
            retcode: 0,
            extra: '',
            command,
            msgCookie: Buffer.alloc(0),
            compressionType: CompressionType.None,
            reserveField: Buffer.alloc(0),
        },
        raw: body,
    });
    return encodeTlv(incomingSsoPacketWrapperSchema, {
        protocol: SSO_PROTOCOL,
        encryptionType: EncryptionType.TeaByEmptyKey,
        flag2: 0,
        uin: '0',
        packet: encryptTea(inner, EMPTY_TEA_KEY),
    });
}

/** 构造一个仅含给定元素列表的私聊推送。 */
function pushWith(elements: Buffer[]): Buffer {
    const message = PushMsgBody.encode({
        responseHead: {
            fromUin: 20001,
            fromUid: 'u_sender',
            type: PushMsgType.PrivateMessage,
            toUin: 10000,
            friendExt: { friendName: 'Alice' },
        },
        contentHead: { type: PushMsgType.PrivateMessage, timestamp: 12345, ntMsgSeq: 7 },
        body: { richText: { elements } },
    });
    return PushMsg.encode({ message });
}

function buildPrivatePush(): Buffer {
    return pushWith([MessageElement.encode({ text: { str: 'hello' } })]);
}

function buildGroupPush(): Buffer {
    const mention = MessageElement.encode({
        text: { str: '@Bot', attr6Buf: Buffer.concat([Buffer.alloc(7), Buffer.from([0, 0, 0x27, 0x11])]) },
    });
    const text = MessageElement.encode({ text: { str: 'hi all' } });
    const face = MessageElement.encode({ face: { index: 14, old: Buffer.from([1]) } });
    const message = PushMsgBody.encode({
        responseHead: {
            fromUin: 20002,
            type: PushMsgType.GroupMessage,
            toUin: 10000,
            groupExt: { groupUin: 888, memberName: 'Bob', groupName: 'G' },
        },
        contentHead: { type: PushMsgType.GroupMessage, timestamp: 54321, sequence: 99 },
        body: { richText: { elements: [mention, text, face] } },
    });
    return PushMsg.encode({ message });
}

const cleanups: Array<() => void> = [];

afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
        cleanup();
    }
});

interface SetupOptions {
    push?: 'private' | 'group';
    onSend?: (body: Buffer) => void;
    /** 非发送类命令的处理器，返回非空值作为响应体。 */
    onCommand?: (command: string, body: Buffer) => Buffer | undefined;
}

async function setup(options: SetupOptions = {}): Promise<MessageService> {
    const appInfo = LINUX_APP_INFO;
    const deviceInfo = newDeviceInfo();

    const server: Server = createServer((socket: Socket) => {
        const reader = new SsoFrameReader();
        socket.on('data', (chunk) => {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            for (const frame of reader.push(buffer)) {
                const { command, sequence, body } = parseOutgoing(frame);
                if (command === SEND_MESSAGE_COMMAND) {
                    options.onSend?.(body);
                    const reply = PbSendMsgResponse.encode({ resultCode: 0, timestamp1: 111, privateSequence: 222 });
                    socket.write(encodeSsoFrame(buildIncoming(command, sequence, reply)));
                    if (options.push) {
                        socket.write(
                            encodeSsoFrame(
                                buildIncoming(MESSAGE_PUSH_COMMAND, 9999, options.push === 'group' ? buildGroupPush() : buildPrivatePush()),
                            ),
                        );
                    }
                } else {
                    const reply = options.onCommand?.(command, body);
                    socket.write(encodeSsoFrame(buildIncoming(command, sequence, reply ?? Buffer.alloc(0))));
                }
            }
        });
    });

    const port = await new Promise<number>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            resolve(typeof address === 'object' && address ? address.port : 0);
        });
    });

    const transport = new SsoTransport({
        host: '127.0.0.1',
        port,
        // 测试用签名桩：满足强制签名校验
        signProvider: {
            async sign() {
                return { sign: Buffer.from('aa', 'hex'), token: Buffer.from('bb', 'hex'), extra: Buffer.from('cc', 'hex') };
            },
        } satisfies SignProvider,
        session: {
            uin: '10000',
            uid: 'u_self',
            a2: Buffer.alloc(0),
            d2: Buffer.alloc(0),
            d2Key: Buffer.alloc(0),
            subAppId: appInfo.SubAppId,
            guid: deviceInfo.guid.toString('hex'),
            version: appInfo.CurrentVersion,
        },
    });
    await transport.connect();

    const service = new MessageService(transport);
    cleanups.push(() => {
        service.dispose();
        transport.close();
        server.close();
    });
    return service;
}

describe('消息收发', () => {
    it('发送私聊消息并返回序列', async () => {
        const service = await setup();
        const result = await service.sendPrivateMessage({ uin: 20001, segments: [{ type: 'text', content: 'hi' }] });
        expect(result).toEqual({ sequence: 222, timestamp: 111 });
    });

    it('接收私聊推送消息', async () => {
        const service = await setup({ push: 'private' });
        const received = new Promise<IncomingMessage>((resolve) => service.onMessage(resolve));
        await service.sendPrivateMessage({ uin: 20001, segments: [{ type: 'text', content: 'hi' }] });

        const message = await received;
        expect(message).toMatchObject({
            type: MessageType.PrivateMessage,
            senderUin: 20001,
            targetUin: 10000,
            senderUid: 'u_sender',
            senderName: 'Alice',
            sequence: 7,
            time: 12345,
        });
        expect(message.segments).toEqual([{ type: 'text', content: 'hello' }]);
    });

    it('接收群推送并解析 mention 与 face', async () => {
        const service = await setup({ push: 'group' });
        const received = new Promise<IncomingMessage>((resolve) => service.onMessage(resolve));
        await service.sendGroupMessage({ groupUin: 888, segments: [{ type: 'text', content: 'hello' }] });

        const message = await received;
        expect(message).toMatchObject({
            type: MessageType.GroupMessage,
            groupUin: 888,
            senderUin: 20002,
            senderName: 'Bob',
            sequence: 99,
        });
        expect(message.segments).toEqual([
            { type: 'mention', name: '@Bot', uin: 0x2711 },
            { type: 'text', content: 'hi all' },
            { type: 'face', id: 14 },
        ]);
    });

    it('非消息类型的推送不会被解析', () => {
        const other = PushMsg.encode({
            message: PushMsgBody.encode({
                responseHead: { fromUin: 1, type: 1, toUin: 2 },
                contentHead: { type: 528, timestamp: 0 },
            }),
        });
        expect(parseIncomingMessage(other)).toBeUndefined();
    });
});

describe('富媒体消息', () => {
    it('发送私聊图片时 businessType 为 10', async () => {
        let captured: Buffer | undefined;
        const service = await setup({ onSend: (body) => (captured = body) });

        const msgInfo = {
            msgInfoBody: [{ index: { info: { width: 640, height: 480 }, fileUuid: 'uuid-1' }, fileExist: true }],
            extBizInfo: { pic: { bizType: 0, textSummary: '[图片]' } },
        };
        await service.sendPrivateMessage({ uin: 20001, segments: [{ type: 'image', msgInfo }] });

        const request = PbSendMsg.decode(captured as Buffer);
        const elements = (request.body?.richText?.elements ?? []).map((raw) => MessageElement.decode(raw));
        expect(elements).toHaveLength(2);
        expect(elements[1].common).toMatchObject({ serviceType: 48, businessType: 10 });
        const decoded = MsgInfo.decode((elements[1].common as { pbElement: Buffer }).pbElement);
        expect(decoded.msgInfoBody[0]?.index?.info?.width).toBe(640);
    });

    it('发送群图片时 businessType 为 20 且携带兼容元素', async () => {
        let captured: Buffer | undefined;
        const service = await setup({ onSend: (body) => (captured = body) });

        const msgInfo = {
            msgInfoBody: [{ index: { info: { width: 640, height: 480 }, fileUuid: 'uuid-1' }, fileExist: true }],
        };
        const compatFace = CustomFaceElement.decode(
            CustomFaceElement.encode({ filePath: '/download', width: 640, height: 480 }),
        );
        await service.sendGroupMessage({ groupUin: 888, segments: [{ type: 'image', msgInfo, compatFace }] });

        const request = PbSendMsg.decode(captured as Buffer);
        const elements = (request.body?.richText?.elements ?? []).map((raw) => MessageElement.decode(raw));
        expect(elements).toHaveLength(2);
        expect(elements[0].customFace).toMatchObject({ filePath: '/download', width: 640, height: 480 });
        expect(elements[1].common).toMatchObject({ serviceType: 48, businessType: 20 });
    });

    it('图片元素原样透传服务端 MsgInfo 与兼容元素', async () => {
        let captured: Buffer | undefined;
        const service = await setup({ onSend: (body) => (captured = body) });

        // 末尾追加我们未建模的字段，验证不会被解码-重编码丢弃
        const msgInfo = Buffer.concat([
            MsgInfo.encode({ msgInfoBody: [{ index: { fileUuid: 'uuid-1' } }] }),
            Buffer.from([0x9a, 0x06, 0x02, 0x01, 0x02]),
        ]);
        const compatFace = Buffer.concat([
            CustomFaceElement.encode({ filePath: '/download' }),
            Buffer.from([0xf2, 0x01, 0x03, 0x01, 0x02, 0x03]),
        ]);
        await service.sendGroupMessage({ groupUin: 888, segments: [{ type: 'image', msgInfo, compatFace }] });

        const request = PbSendMsg.decode(captured as Buffer);
        const elements = request.body?.richText?.elements ?? [];
        expect(elements[0].includes(compatFace)).toBe(true);
        expect(elements[1].includes(msgInfo)).toBe(true);
    });

    it('发送群消息时前置引用元素', async () => {
        let captured: Buffer | undefined;
        const service = await setup({ onSend: (body) => (captured = body) });

        await service.sendGroupMessage({
            groupUin: 888,
            segments: [{ type: 'text', content: 'ok' }],
            reply: { sequence: 42, senderUin: 999, senderUid: 'u_reply', senderName: 'Eve', messageUid: 1n },
        });

        const request = PbSendMsg.decode(captured as Buffer);
        const elements = (request.body?.richText?.elements ?? []).map((raw) => MessageElement.decode(raw));
        expect(elements[0].srcMsg).toMatchObject({ senderUin: 999, flag: 0, origSeqs: [42] });
        expect(elements[0].srcMsg?.pbReserve).toMatchObject({ oriMsgType: 2, messageId: 1n, senderUid: 'u_reply' });
        // 引用后紧跟 @ 原文发送者，并附一个空格元素
        expect(elements.map((element) => (element.text ? 'text' : element.srcMsg ? 'src' : 'other'))).toEqual([
            'src',
            'text',
            'text',
            'text',
        ]);
        expect(elements[1].text?.str).toBe('@Eve');
        expect(elements[2].text?.str).toBe(' ');
        expect(elements[3].text?.str).toBe('ok');
    });

    it('发送 JSON 卡片时构建 LightApp 元素', async () => {
        let captured: Buffer | undefined;
        const service = await setup({ onSend: (body) => (captured = body) });

        await service.sendGroupMessage({
            groupUin: 888,
            segments: [{ type: 'lightApp', payload: '{"app":"com.tencent.test"}' }],
        });

        const request = PbSendMsg.decode(captured as Buffer);
        const elements = (request.body?.richText?.elements ?? []).map((raw) => MessageElement.decode(raw));
        const data = elements[0].lightApp?.bytesData;
        expect(data?.[0]).toBe(0x01);
        expect(inflateSync(data!.subarray(1)).toString('utf8')).toBe('{"app":"com.tencent.test"}');
    });

    it('解析合并转发卡片为 forward 段', () => {
        const payload = JSON.stringify({ app: 'com.tencent.multimsg', meta: { detail: { resid: 'res-7' } } });
        const element = MessageElement.encode({
            lightApp: { bytesData: Buffer.concat([Buffer.from([0x01]), deflateSync(payload)]) },
        });
        expect(parseIncomingMessage(pushWith([element]))?.segments).toEqual([{ type: 'forward', resId: 'res-7' }]);
    });

    it('解析普通 JSON 卡片为 lightApp 段', () => {
        const payload = '{"app":"com.tencent.test"}';
        const element = MessageElement.encode({
            lightApp: { bytesData: Buffer.concat([Buffer.from([0x01]), deflateSync(payload)]) },
        });
        expect(parseIncomingMessage(pushWith([element]))?.segments).toEqual([{ type: 'lightApp', payload }]);
    });

    it('发送视频时群聊 businessType 为 21、私聊为 11', async () => {
        const captured: Buffer[] = [];
        const service = await setup({ onSend: (body) => captured.push(body) });

        const msgInfo = { msgInfoBody: [{ index: { fileUuid: 'video-1' } }] };
        await service.sendGroupMessage({ groupUin: 888, segments: [{ type: 'video', msgInfo }] });
        await service.sendPrivateMessage({ uin: 20001, segments: [{ type: 'video', msgInfo }] });

        const group = PbSendMsg.decode(captured[0] as Buffer);
        const groupElements = (group.body?.richText?.elements ?? []).map((raw) => MessageElement.decode(raw));
        expect(groupElements[0].common).toMatchObject({ serviceType: 48, businessType: 21 });
        expect(MsgInfo.decode((groupElements[0].common as { pbElement: Buffer }).pbElement).msgInfoBody[0]?.index?.fileUuid).toBe(
            'video-1',
        );

        const priv = PbSendMsg.decode(captured[1] as Buffer);
        const privElements = (priv.body?.richText?.elements ?? []).map((raw) => MessageElement.decode(raw));
        expect(privElements[0].common).toMatchObject({ serviceType: 48, businessType: 11 });
    });

    it('解析 NT 图片推送', () => {
        const msgInfo = MsgInfo.encode({
            msgInfoBody: [{ index: { info: { width: 640, height: 480 } }, fileExist: true }],
            extBizInfo: { pic: { bizType: 0, textSummary: '[图片]' } },
        });
        const element = MessageElement.encode({ common: { serviceType: 48, pbElement: msgInfo, businessType: 20 } });
        const message = parseIncomingMessage(pushWith([element]));
        expect(message?.segments[0]).toEqual({
            type: 'image',
            width: 640,
            height: 480,
            subType: 0,
            summary: '[图片]',
            indexNode: {
                info: { fileSize: 0, height: 480, original: 0, time: 0, width: 640 },
                storeId: 0,
                subType: 0,
                ttl: 0,
                uploadTime: 0,
            },
        });
    });

    it('解析旧版图片推送', () => {
        const element = MessageElement.encode({
            notOnlineImage: {
                origUrl: '/download?appid=1&fileid=456',
                picWidth: 100,
                picHeight: 50,
                pbRes: { subType: 0, summary: '[图片]' },
            },
        });
        const message = parseIncomingMessage(pushWith([element]));
        expect(message?.segments[0]).toEqual({
            type: 'image',
            url: 'https://multimedia.nt.qq.com.cn/download?appid=1&fileid=456',
            width: 100,
            height: 50,
            subType: 0,
            summary: '[图片]',
        });
    });

    it('解析语音推送', () => {
        const msgInfo = MsgInfo.encode({ msgInfoBody: [{ index: { fileUuid: 'voice-1', storeId: 3 } }] });
        const element = MessageElement.encode({ common: { serviceType: 48, pbElement: msgInfo, businessType: 22 } });
        const message = parseIncomingMessage(pushWith([element]));
        const segment = message?.segments[0];
        expect(segment?.type).toBe('record');
        expect(segment?.type === 'record' ? segment.indexNode.fileUuid : undefined).toBe('voice-1');
    });

    it('解析大头像表情推送', () => {
        const info = LargeFaceInfo.encode({
            aniStickerPackId: '',
            aniStickerId: '',
            faceId: 5,
            field4: 0,
            aniStickerType: 0,
            field6: '',
            preview: 'preview',
            field9: 0,
        });
        const element = MessageElement.encode({ common: { serviceType: 37, pbElement: info, businessType: 1 } });
        const message = parseIncomingMessage(pushWith([element]));
        expect(message?.segments[0]).toEqual({ type: 'face', id: 5, summary: 'preview' });
    });

    it('解析引用推送并提取被引用序列', () => {
        const src = MessageElement.encode({
            srcMsg: { origSeqs: [42], senderUin: 999, pbReserve: { messageId: 1n, senderUid: 'u_x', friendSequence: 42 } },
        });
        const text = MessageElement.encode({ text: { str: 'ok' } });
        const message = parseIncomingMessage(pushWith([src, text]));
        expect(message?.repliedSequence).toBe(42);
        expect(message?.segments).toEqual([{ type: 'text', content: 'ok' }]);
    });

    it('引用推送中指向被引用者的 @ 占位不会重复上报', () => {
        const mention = (str: string) =>
            MessageElement.encode({
                text: {
                    str,
                    pbReserve: MentionExtra.encode({ type: MentionType.Someone, uin: 999, uid: 'u_x' }),
                },
            });
        const src = MessageElement.encode({
            srcMsg: { origSeqs: [42], senderUin: 999, pbReserve: { friendSequence: 42 } },
        });
        // srcMsg 后的第一个 @ 是引用占位，第二个才是真实 @
        const message = parseIncomingMessage(pushWith([src, mention('@999'), mention('@999'), MessageElement.encode({ text: { str: ' 1' } })]));
        expect(message?.repliedSequence).toBe(42);
        expect(message?.segments).toEqual([
            { type: 'mention', name: '@999', uin: 999 },
            { type: 'text', content: ' 1' },
        ]);
    });
});

describe('消息撤回', () => {
    it('撤回群消息发送正确的命令', async () => {
        const commands: Array<{ command: string; body: Buffer }> = [];
        const service = await setup({
            onCommand: (command, body) => {
                commands.push({ command, body });
                return Buffer.alloc(0);
            },
        });
        await service.sendGroupMessage({ groupUin: 888, segments: [{ type: 'text', content: 'hi' }] });

        await service.recallMessage(222, async () => 'u_x');

        expect(commands).toHaveLength(1);
        expect(commands[0].command).toBe(RECALL_GROUP_COMMAND);
        expect(SsoGroupRecallMsg.decode(commands[0].body)).toEqual({ type: 1, groupUin: 888, info: { sequence: 222 } });
    });

    it('撤回私聊消息发送正确的命令', async () => {
        const commands: Array<{ command: string; body: Buffer }> = [];
        const service = await setup({
            onCommand: (command, body) => {
                commands.push({ command, body });
                return Buffer.alloc(0);
            },
        });
        await service.sendPrivateMessage({ uin: 20001, segments: [{ type: 'text', content: 'hi' }] });

        await service.recallMessage(222, async () => 'u_friend');

        expect(commands).toHaveLength(1);
        expect(commands[0].command).toBe(RECALL_PRIVATE_COMMAND);
        const decoded = SsoC2CRecallMsg.decode(commands[0].body);
        expect(decoded).toMatchObject({ type: 1, targetUid: 'u_friend', info: { ntMsgSeq: 222, timestamp: 111 } });
        expect(decoded.info.messageUid).toBe((0x01000000n << 32n) | BigInt(decoded.info.random));
    });

    it('撤回未知消息抛出异常', async () => {
        const service = await setup();
        await expect(service.recallMessage(999, async () => 'u')).rejects.toThrow(/缺少发送上下文/);
    });
});

describe('回复目标解析', () => {
    it('缓存入站消息后可按序列解析引用信息', async () => {
        const service = await setup({ push: 'group' });
        const received = new Promise<IncomingMessage>((resolve) => service.onMessage(resolve));
        await service.sendGroupMessage({ groupUin: 888, segments: [{ type: 'text', content: 'hi' }] });
        const message = await received;

        expect(service.resolveReply(message.sequence)).toMatchObject({
            sequence: message.sequence,
            senderUin: 20002,
            senderName: 'Bob',
        });
    });

    it('未缓存的消息返回 undefined', async () => {
        const service = await setup();
        expect(service.resolveReply(12345)).toBeUndefined();
    });
});

describe('历史消息拉取', () => {
    it('拉取群历史消息并解析为入站消息', async () => {
        const commands: string[] = [];
        const service = await setup({
            onCommand: (command) => {
                commands.push(command);
                return SsoGetGroupMsgResponse.encode({
                    body: {
                        messages: [
                            {
                                responseHead: {
                                    fromUin: 20002,
                                    type: PushMsgType.GroupMessage,
                                    toUin: 10000,
                                    groupExt: { groupUin: 888, memberName: 'Bob', groupName: 'G' },
                                },
                                contentHead: { type: PushMsgType.GroupMessage, timestamp: 54321, sequence: 99 },
                                body: { richText: { elements: [MessageElement.encode({ text: { str: 'hi' } })] } },
                            },
                        ],
                    },
                });
            },
        });

        const messages = await service.fetchGroupMessages(888, 1, 10);
        expect(commands).toEqual([GET_GROUP_MESSAGES_COMMAND]);
        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({
            type: MessageType.GroupMessage,
            groupUin: 888,
            senderUin: 20002,
            sequence: 99,
            segments: [{ type: 'text', content: 'hi' }],
        });
    });

    it('拉取私聊历史消息并解析为入站消息', async () => {
        const commands: string[] = [];
        const service = await setup({
            onCommand: (command) => {
                commands.push(command);
                return SsoGetC2CMsgResponse.encode({
                    messages: [
                        {
                            responseHead: {
                                fromUin: 20001,
                                type: PushMsgType.PrivateMessage,
                                toUin: 10000,
                                friendExt: { friendName: 'Alice' },
                            },
                            contentHead: { type: PushMsgType.PrivateMessage, timestamp: 1, ntMsgSeq: 7 },
                            body: { richText: { elements: [MessageElement.encode({ text: { str: 'yo' } })] } },
                        },
                    ],
                });
            },
        });

        const messages = await service.fetchC2CMessages('u_friend', 1, 10);
        expect(commands).toEqual([GET_C2C_MESSAGES_COMMAND]);
        expect(messages[0]).toMatchObject({
            type: MessageType.PrivateMessage,
            senderUin: 20001,
            sequence: 7,
            segments: [{ type: 'text', content: 'yo' }],
        });
    });
});

describe('合并转发', () => {
    it('上传群节点返回 resid，载荷含 fake 消息与节点预览', async () => {
        const commands: Array<{ command: string; body: Buffer }> = [];
        const service = await setup({
            onCommand: (command, body) => {
                commands.push({ command, body });
                return LongMsgInterfaceRsp.encode({ sendRsp: { resId: 'res-1' } });
            },
        });

        const nodes: ForwardNode[] = [
            { uin: 20002, nickname: 'Bob', time: 1000, segments: [{ type: 'text', content: 'hello' }] },
            { uin: 20003, nickname: 'Carol', time: 1001, segments: [{ type: 'text', content: 'world' }] },
        ];
        const resId = await service.uploadForward({ kind: 'group', groupUin: 888 }, nodes);

        expect(resId).toBe('res-1');
        expect(commands).toHaveLength(1);
        expect(commands[0].command).toBe(SEND_FORWARD_COMMAND);

        const request = LongMsgInterfaceReq.decode(commands[0].body);
        expect(request.sendReq).toMatchObject({ msgType: 3, groupUin: 888n, peerInfo: { peerUid: '888' } });
        expect(request.attr).toMatchObject({ subCmd: 4, clientType: 1, platform: 3, proxyType: 0 });

        const content = PbMultiMsgTransmit.decode(gunzipSync(request.sendReq?.payload as Buffer));
        expect(content.items[0]?.fileName).toBe('MultiMsg');
        const messages = content.items[0]?.buffer?.msg ?? [];
        expect(messages).toHaveLength(2);
        expect(messages[0].routingHead).toMatchObject({
            fromUin: 20002n,
            groupExt: { groupCode: 888n, groupCard: 'Bob', groupCardType: 2 },
        });
        expect(messages[0].contentHead).toMatchObject({ type: 82, timestamp: 1000 });
        const elements = (messages[0].body?.richText?.elements ?? []).map((raw) => MessageElement.decode(raw));
        expect(elements[0].text?.str).toBe('hello');

        const card = JSON.parse(buildForwardCard(resId, forwardPreviews(nodes)));
        expect(card.app).toBe('com.tencent.multimsg');
        expect(card.meta.detail).toMatchObject({ resid: 'res-1', source: '聊天记录', summary: '查看2条转发消息' });
        expect(card.meta.detail.news.map((item: { text: string }) => item.text)).toEqual(['Bob: hello', 'Carol: world']);
        expect(JSON.parse(card.extra).tsum).toBe(2);
    });

    it('私聊合并转发使用 msgType 1 并携带双方 uid', async () => {
        const commands: Array<{ command: string; body: Buffer }> = [];
        const service = await setup({
            onCommand: (command, body) => {
                commands.push({ command, body });
                return LongMsgInterfaceRsp.encode({ sendRsp: { resId: 'res-2' } });
            },
        });

        const nodes: ForwardNode[] = [
            { uin: 20001, uid: 'u_alice', nickname: 'Alice', time: 5, segments: [{ type: 'text', content: 'hi' }] },
        ];
        await service.uploadForward({ kind: 'private', uin: 20001, uid: 'u_peer' }, nodes);

        const request = LongMsgInterfaceReq.decode(commands[0].body);
        expect(request.sendReq).toMatchObject({ msgType: 1, groupUin: 0n, peerInfo: { peerUid: 'u_peer' } });

        const content = PbMultiMsgTransmit.decode(gunzipSync(request.sendReq?.payload as Buffer));
        const message = content.items[0]?.buffer?.msg[0];
        expect(message?.routingHead).toMatchObject({
            fromUin: 20001n,
            fromUid: 'u_alice',
            toUin: 20001n,
            toUid: 'u_peer',
            c2cExt: { name: 'Alice' },
        });
        expect(message?.contentHead?.type).toBe(166);
    });

    it('拉取已存在的合并转发并解析节点预览', async () => {
        const commands: Array<{ command: string; body: Buffer }> = [];
        const service = await setup({
            onCommand: (command, body) => {
                commands.push({ command, body });
                const content = PbMultiMsgTransmit.encode({
                    items: [
                        {
                            fileName: 'MultiMsg',
                            buffer: {
                                msg: [
                                    {
                                        routingHead: { fromUin: 20002n, groupExt: { groupCode: 888n, groupCard: 'Bob' } },
                                        contentHead: { type: 82, timestamp: 1000 },
                                        body: { richText: { elements: [MessageElement.encode({ text: { str: 'hello' } })] } },
                                    },
                                ],
                            },
                        },
                    ],
                });
                return LongMsgInterfaceRsp.encode({ recvRsp: { resId: 'res-9', payload: gzipSync(content) } });
            },
        });

        const previews = await service.fetchForwardPreviews({ kind: 'group', groupUin: 888 }, 'res-9');
        await service.fetchForwardPreviews({ kind: 'private', uin: 20001, uid: 'u_peer' }, 'res-9');

        expect(commands.map((item) => item.command)).toEqual([FETCH_FORWARD_COMMAND, FETCH_FORWARD_COMMAND]);
        // 拉取时 PeerUid 为请求方（自己）的 uid，msgType 与发送相反：群聊 1、私聊 3
        expect(LongMsgInterfaceReq.decode(commands[0].body).recvReq).toMatchObject({
            resId: 'res-9',
            msgType: 1,
            peerInfo: { peerUid: 'u_self' },
        });
        expect(LongMsgInterfaceReq.decode(commands[0].body).attr).toMatchObject({
            subCmd: 2,
            clientType: 1,
            platform: 3,
            proxyType: 0,
        });
        expect(LongMsgInterfaceReq.decode(commands[1].body).recvReq?.msgType).toBe(3);

        expect(previews).toEqual([{ nickname: 'Bob', text: 'hello' }]);
        expect(JSON.parse(buildForwardCard('res-9', previews)).meta.detail.news).toEqual([{ text: 'Bob: hello' }]);
    });

    it('空节点列表抛出异常', async () => {
        const service = await setup();
        await expect(service.uploadForward({ kind: 'group', groupUin: 888 }, [])).rejects.toThrow(/至少需要一个节点/);
    });
});
