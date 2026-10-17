import { CustomFaceElement, MsgInfo } from '@diana/core';
import { describe, expect, it } from 'vitest';
import type { OneBotContext } from '../../src/ctx.js';
import { handleAction } from '../../src/server/actions.js';

/** 模拟上传响应里的 CompatQMsg（群聊为 CustomFace）。 */
const COMPAT_FACE = CustomFaceElement.encode({ filePath: '/download', width: 640, height: 480 });

/** 模拟上传响应里的 MsgInfo 原始字节。 */
const MSG_INFO = MsgInfo.encode({ msgInfoBody: [{ index: { fileUuid: 'uuid-g' } }] });

function pngBase64(width: number, height: number): string {
    const buffer = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
    buffer.writeUInt32BE(width, 16);
    buffer.writeUInt32BE(height, 20);
    return `base64://${buffer.toString('base64')}`;
}

/** 构造仅含 ftyp + moov(mvhd/tkhd) 的最小 MP4，用于探测测试。 */
function mp4Base64(): string {
    const box = (type: string, body: Buffer): Buffer => {
        const head = Buffer.alloc(8);
        head.writeUInt32BE(8 + body.length);
        head.write(type, 4, 'latin1');
        return Buffer.concat([head, body]);
    };
    // mvhd（version 0）：timescale=1000、duration=5000（偏移去掉 8 字节 box 头）
    const mvhdBody = Buffer.alloc(24);
    mvhdBody.writeUInt32BE(1000, 12);
    mvhdBody.writeUInt32BE(5000, 16);
    // tkhd：尾部 width=640、height=360（16.16 定点数）
    const tkhdBody = Buffer.alloc(84);
    tkhdBody.writeUInt32BE(640 << 16, 76);
    tkhdBody.writeUInt32BE(360 << 16, 80);
    const ftyp = box('ftyp', Buffer.from('isom', 'latin1'));
    const moov = box('moov', Buffer.concat([box('mvhd', mvhdBody), box('tkhd', tkhdBody)]));
    return `base64://${Buffer.concat([ftyp, moov]).toString('base64')}`;
}

function createCtx(reply?: { sequence: number; senderUin: number; senderUid?: string; senderName?: string }) {
    const images: Array<{ target: number | string; width: number; height: number }> = [];
    const records: Array<{ target: number | string; duration: number }> = [];
    const sent: Array<{ groupUin?: number; uin?: number; segments: unknown[]; reply?: unknown }> = [];
    const recalls: number[] = [];
    const likes: Array<{ uid: string; count: number }> = [];
    const groupActions: Array<{ name: string; args: unknown[] }> = [];
    const friendActions: Array<{ name: string; args: unknown[] }> = [];
    const historyQueries: Array<{ kind: string; groupUin?: number; uid?: string; startSequence: number; endSequence: number }> = [];
    const pokes: Array<{ groupUin?: number; uin: number }> = [];
    const forwards: Array<{ target: unknown; nodes: unknown[] }> = [];
    const fetched: Array<{ target: unknown; resId: string }> = [];
    const forwardMessages: Array<{ target: unknown; resId: string }> = [];
    const roamQueries: Array<{ uid: string; time: number; count: number }> = [];
    const groupFileActions: Array<{ name: string; args: unknown[] }> = [];
    const privateFileActions: Array<{ name: string; args: unknown[] }> = [];
    const cookieQueries: string[][] = [];
    const groupImage = async (groupUin: number, _data: Buffer, image: { width: number; height: number }) => {
        images.push({ target: groupUin, width: image.width, height: image.height });
        return { msgInfo: MSG_INFO, compat: COMPAT_FACE };
    };
    const privateImage = async (uid: string, _data: Buffer, image: { width: number; height: number }) => {
        images.push({ target: uid, width: image.width, height: image.height });
        return { msgInfo: MSG_INFO };
    };
    const groupRecord = async (groupUin: number, _data: Buffer, _meta: unknown, duration: number) => {
        records.push({ target: groupUin, duration });
        return { msgInfo: MSG_INFO };
    };
    const privateRecord = async (uid: string, _data: Buffer, _meta: unknown, duration: number) => {
        records.push({ target: uid, duration });
        return { msgInfo: MSG_INFO };
    };
    const videos: Array<{ target: number | string }> = [];
    const groupVideo = async (groupUin: number, _data: Buffer, _meta: unknown, _thumbnail: unknown) => {
        videos.push({ target: groupUin });
        return { msgInfo: MSG_INFO };
    };
    const privateVideo = async (uid: string, _data: Buffer, _meta: unknown, _thumbnail: unknown) => {
        videos.push({ target: uid });
        return { msgInfo: MSG_INFO };
    };

    const ctx = {
        selfId: 10000,
        transport: { isConnected: true },
        message: {
            onMessage: () => undefined,
            offMessage: () => undefined,
            sendGroupMessage: async (options: { groupUin: number; segments: unknown[]; reply?: unknown }) => {
                sent.push({ groupUin: options.groupUin, segments: options.segments, reply: options.reply });
                return { sequence: 7, timestamp: 0 };
            },
            sendPrivateMessage: async (options: { uin: number; segments: unknown[]; reply?: unknown }) => {
                sent.push({ uin: options.uin, segments: options.segments, reply: options.reply });
                return { sequence: 8, timestamp: 0 };
            },
            recallMessage: async (sequence: number) => {
                recalls.push(sequence);
            },
            resolveReply: (sequence: number) => (reply && reply.sequence === sequence ? reply : undefined),
            uploadForward: async (target: unknown, nodes: unknown[]) => {
                forwards.push({ target, nodes });
                return 'res-group';
            },
            fetchForwardPreviews: async (target: unknown, resId: string) => {
                fetched.push({ target, resId });
                return [{ nickname: 'Alice', text: 'hi' }];
            },
            fetchForwardMessages: async (target: unknown, resId: string) => {
                forwardMessages.push({ target, resId });
                return [{ uin: 20001, nickname: 'Alice', time: 123, segments: [{ type: 'text', content: 'hi' }] }];
            },
            fetchGroupMessages: async (groupUin: number, startSequence: number, endSequence: number) => {
                historyQueries.push({ kind: 'group', groupUin, startSequence, endSequence });
                return [
                    {
                        type: 2,
                        time: 100,
                        senderUin: 20001,
                        targetUin: 10000,
                        senderName: 'Alice',
                        groupUin,
                        sequence: endSequence,
                        segments: [{ type: 'text', content: 'hi' }],
                    },
                ];
            },
            fetchC2CMessages: async (uid: string, startSequence: number, endSequence: number) => {
                historyQueries.push({ kind: 'c2c', uid, startSequence, endSequence });
                return [
                    {
                        type: 1,
                        time: 100,
                        senderUin: 20001,
                        targetUin: 10000,
                        senderName: 'Alice',
                        sequence: endSequence,
                        segments: [{ type: 'text', content: 'hi' }],
                    },
                ];
            },
            fetchC2CLatestSequence: async () => 80,
            fetchRoamMessages: async (uid: string, time: number, count: number) => {
                roamQueries.push({ uid, time, count });
                return [
                    {
                        type: 1,
                        time: 100,
                        senderUin: 20001,
                        targetUin: 10000,
                        senderName: 'Alice',
                        sequence: 1,
                        segments: [{ type: 'text', content: 'hi' }],
                    },
                ];
            },
            getCachedMessage: (sequence: number) =>
                sequence === 42
                    ? {
                          type: 2,
                          time: 100,
                          senderUin: 20001,
                          targetUin: 10000,
                          senderName: 'Alice',
                          groupUin: 888,
                          sequence: 42,
                          segments: [{ type: 'text', content: 'hi' }],
                      }
                    : undefined,
            clearCaches: () => undefined,
        },
        notify: { onNotify: () => undefined, offNotify: () => undefined },
        friend: {
            fetchFriends: async () => ({ friends: [{ uin: 20001, uid: 'u_20001', nickname: '', remark: '' }] }),
            sendLike: async (uid: string, count: number) => {
                likes.push({ uid, count });
            },
            poke: async (uin: number) => {
                pokes.push({ uin });
            },
            handleFriendRequest: async (targetUid: string, accept: boolean) => {
                friendActions.push({ name: 'handleFriendRequest', args: [targetUid, accept] });
            },
        },
        group: {
            fetchGroups: async () => [
                {
                    groupUin: 888,
                    ownerUid: 'u_owner',
                    createdTime: 0,
                    memberMax: 500,
                    memberCount: 10,
                    name: '测试群',
                    description: '',
                    question: '',
                    announcement: '',
                },
            ],
            fetchGroupMembers: async () => ({ members: [{ uin: 20001, uid: 'u_20001' }] }),
            fetchGroupNotifications: async () => [
                {
                    sequence: 9,
                    type: 1,
                    state: 1,
                    groupUin: 888,
                    targetUid: 'u_20001',
                    comment: '',
                },
            ],
            fetchLatestMessageSeq: async () => 90,
            quitGroup: async (groupUin: number) => {
                groupActions.push({ name: 'quitGroup', args: [groupUin] });
            },
            setMemberAdmin: async (groupUin: number, uid: string, isAdmin: boolean) => {
                groupActions.push({ name: 'setMemberAdmin', args: [groupUin, uid, isAdmin] });
            },
            setMemberSpecialTitle: async (groupUin: number, uid: string, title: string) => {
                groupActions.push({ name: 'setMemberSpecialTitle', args: [groupUin, uid, title] });
            },
            handleGroupRequest: async (groupUin: number, sequence: number, eventType: number, accept: boolean) => {
                groupActions.push({ name: 'handleGroupRequest', args: [groupUin, sequence, eventType, accept] });
            },
            muteMember: async (groupUin: number, uid: string, duration: number) => {
                groupActions.push({ name: 'muteMember', args: [groupUin, uid, duration] });
            },
            muteAllMembers: async (groupUin: number, enable: boolean) => {
                groupActions.push({ name: 'muteAllMembers', args: [groupUin, enable] });
            },
            setMemberCard: async (groupUin: number, uid: string, card: string) => {
                groupActions.push({ name: 'setMemberCard', args: [groupUin, uid, card] });
            },
            kickMember: async (groupUin: number, uid: string, reject: boolean, reason: string) => {
                groupActions.push({ name: 'kickMember', args: [groupUin, uid, reject, reason] });
            },
            setGroupName: async (groupUin: number, name: string) => {
                groupActions.push({ name: 'setGroupName', args: [groupUin, name] });
            },
            pokeMember: async (groupUin: number, uin: number) => {
                pokes.push({ groupUin, uin });
            },
        },
        user: { fetchUserInfo: async () => ({ uin: 20001 }) },
        media: {
            uploadGroupImage: groupImage,
            uploadPrivateImage: privateImage,
            uploadGroupRecord: groupRecord,
            uploadPrivateRecord: privateRecord,
            uploadGroupVideo: groupVideo,
            uploadPrivateVideo: privateVideo,
        },
        groupFile: {
            upload: async (groupUin: number, targetDirectory: string, fileName: string) => {
                groupFileActions.push({ name: 'upload', args: [groupUin, targetDirectory, fileName] });
            },
            getDownloadUrl: async (groupUin: number, fileId: string) => {
                groupFileActions.push({ name: 'getDownloadUrl', args: [groupUin, fileId] });
                return 'https://example.com/file';
            },
            delete: async (groupUin: number, fileId: string) => {
                groupFileActions.push({ name: 'delete', args: [groupUin, fileId] });
            },
            rename: async (groupUin: number, fileId: string, parentDirectory: string, newName: string) => {
                groupFileActions.push({ name: 'rename', args: [groupUin, fileId, parentDirectory, newName] });
            },
            move: async (groupUin: number, fileId: string, parentDirectory: string, targetDirectory: string) => {
                groupFileActions.push({ name: 'move', args: [groupUin, fileId, parentDirectory, targetDirectory] });
            },
        },
        privateFile: {
            upload: async (uin: number, uid: string, fileName: string) => {
                privateFileActions.push({ name: 'upload', args: [uin, uid, fileName] });
            },
        },
        system: {
            fetchCookies: async (domains: string[]) => {
                cookieQueries.push(domains);
                return { p_skey: 'abc', skey: 'def' };
            },
            fetchCsrfToken: async () => 123456,
        },
        highway: {},
    } as unknown as OneBotContext;
    return {
        ctx,
        images,
        records,
        videos,
        sent,
        recalls,
        likes,
        groupActions,
        friendActions,
        pokes,
        forwards,
        fetched,
        forwardMessages,
        historyQueries,
        roamQueries,
        groupFileActions,
        privateFileActions,
        cookieQueries,
    };
}

describe('历史消息 API', () => {
    it('群历史：锚点 0 从最新往回取', async () => {
        const { ctx, historyQueries } = createCtx();
        const response = await handleAction(ctx, 'get_group_msg_history', { group_id: 888, message_seq: 0, count: 20 });
        expect(response).toMatchObject({ status: 'ok' });
        expect(historyQueries).toEqual([{ kind: 'group', groupUin: 888, startSequence: 71, endSequence: 90 }]);
    });

    it('群历史：锚点包含在取值范围内', async () => {
        const { ctx, historyQueries } = createCtx();
        await handleAction(ctx, 'get_group_msg_history', { group_id: 888, message_seq: 100, count: 5 });
        expect(historyQueries).toEqual([{ kind: 'group', groupUin: 888, startSequence: 96, endSequence: 100 }]);
    });

    it('私聊历史：锚点 0 用最新序列号', async () => {
        const { ctx, historyQueries } = createCtx();
        await handleAction(ctx, 'get_friend_msg_history', { user_id: 20001, count: 10 });
        expect(historyQueries).toEqual([{ kind: 'c2c', uid: 'u_20001', startSequence: 71, endSequence: 80 }]);
    });
});

describe('动作处理', () => {
    it('群聊发送图片：上传后作为图片段发送', async () => {
        const { ctx, images, sent } = createCtx();
        const response = await handleAction(ctx, 'send_group_msg', {
            group_id: 888,
            message: [{ type: 'text', data: { text: '看图' } }, { type: 'image', data: { file: pngBase64(640, 480) } }],
        });

        expect(response).toMatchObject({ status: 'ok', data: { message_id: 7 } });
        expect(images).toEqual([{ target: 888, width: 640, height: 480 }]);
        // 兼容元素与 MsgInfo 均为原始字节，不做解码
        expect(sent[0]?.segments).toEqual([
            { type: 'text', content: '看图' },
            { type: 'image', msgInfo: MSG_INFO, compatFace: COMPAT_FACE },
        ]);
    });

    it('私聊发送图片：解析 uid 后上传', async () => {
        const { ctx, images, sent } = createCtx();
        const response = await handleAction(ctx, 'send_private_msg', {
            user_id: 20001,
            message: [{ type: 'image', data: { file: pngBase64(16, 8) } }],
        });

        expect(response).toMatchObject({ status: 'ok', data: { message_id: 8 } });
        expect(images).toEqual([{ target: 'u_20001', width: 16, height: 8 }]);
        expect(sent[0]).toMatchObject({ uin: 20001 });
    });

    it('群聊发送语音：上传后作为语音段发送', async () => {
        const { ctx, records } = createCtx();
        const amr = Buffer.concat([Buffer.from('#!AMR\n', 'latin1'), Buffer.from([0x3c, ...new Array(31).fill(0)])]);
        const response = await handleAction(ctx, 'send_group_msg', {
            group_id: 888,
            message: [{ type: 'record', data: { file: `base64://${amr.toString('base64')}` } }],
        });

        expect(response).toMatchObject({ status: 'ok' });
        expect(records).toEqual([{ target: 888, duration: 20 }]);
    });

    it('私聊发送图片但非好友时抛错', async () => {
        const { ctx } = createCtx();
        (ctx.friend as { fetchFriends: () => Promise<{ friends: unknown[] }> }).fetchFriends = async () => ({ friends: [] });
        await expect(
            handleAction(ctx, 'send_private_msg', {
                user_id: 99999,
                message: [{ type: 'image', data: { file: pngBase64(1, 1) } }],
            }),
        ).rejects.toThrow('无法解析用户 99999 的 uid');
    });

    it('官方未实现的段类型抛错', async () => {
        const { ctx } = createCtx();
        await expect(
            handleAction(ctx, 'send_group_msg', {
                group_id: 888,
                message: [{ type: 'mface', data: { emoji_id: '1' } }],
            }),
        ).rejects.toThrow('暂不支持的段类型');
    });

    it('json 段转换为 LightApp 段', async () => {
        const { ctx, sent } = createCtx();
        const response = await handleAction(ctx, 'send_group_msg', {
            group_id: 888,
            message: [{ type: 'json', data: { data: '{"app":"com.tencent.test"}' } }],
        });
        expect(response).toMatchObject({ status: 'ok' });
        expect(sent[0]?.segments).toEqual([{ type: 'lightApp', payload: '{"app":"com.tencent.test"}' }]);
    });

    it('群聊发送视频：上传后作为视频段发送', async () => {
        const { ctx, videos, sent } = createCtx();
        const response = await handleAction(ctx, 'send_group_msg', {
            group_id: 888,
            message: [{ type: 'video', data: { file: mp4Base64() } }],
        });
        expect(response).toMatchObject({ status: 'ok' });
        expect(videos).toEqual([{ target: 888 }]);
        expect(sent[0]?.segments).toEqual([{ type: 'video', msgInfo: MSG_INFO }]);
    });

    it('file 段支持扁平结构（Karin 风格）', async () => {
        const uploads: Array<{ target: number | string; fileName: string }> = [];
        const { ctx } = createCtx();
        (ctx as { privateFile: { upload: (uin: number, uid: string, name: string, data: Buffer, meta: unknown) => Promise<void> } }).privateFile = {
            upload: async (uin, _uid, fileName) => {
                uploads.push({ target: uin, fileName });
            },
        };
        const response = await handleAction(ctx, 'send_private_msg', {
            user_id: 20001,
            message: [{ type: 'file', file: 'data:text/plain;base64,SGVsbG8=', name: 'log.txt', size: 5 }],
        });
        expect(response).toMatchObject({ status: 'ok' });
        expect(uploads).toEqual([{ target: 20001, fileName: 'log.txt' }]);
    });

    it('node 段上传为合并转发并发送 multimsg 卡片', async () => {
        const { ctx, forwards, sent } = createCtx();
        const response = await handleAction(ctx, 'send_group_msg', {
            group_id: 888,
            message: [
                { type: 'node', data: { user_id: '20001', nickname: 'Alice', content: 'hi' } },
                { type: 'node', data: { user_id: '20002', nickname: 'Bob', content: [{ type: 'text', data: { text: 'yo' } }] } },
            ],
        });

        expect(response).toMatchObject({ status: 'ok' });
        expect(forwards[0]?.target).toEqual({ kind: 'group', groupUin: 888 });
        expect(forwards[0]?.nodes).toEqual([
            { uin: 20001, nickname: 'Alice', time: expect.any(Number), segments: [{ type: 'text', content: 'hi' }] },
            { uin: 20002, nickname: 'Bob', time: expect.any(Number), segments: [{ type: 'text', content: 'yo' }] },
        ]);

        const segments = sent[0]?.segments as Array<{ type: string; payload: string }>;
        expect(segments).toHaveLength(1);
        const card = JSON.parse(segments[0].payload);
        expect(card.app).toBe('com.tencent.multimsg');
        expect(card.meta.detail.resid).toBe('res-group');
        expect(card.meta.detail.news.map((item: { text: string }) => item.text)).toEqual(['Alice: hi', 'Bob: yo']);
    });

    it('send_group_forward_msg 接受 messages 字段与 uin/name 别名节点', async () => {
        const { ctx, forwards } = createCtx();
        const response = await handleAction(ctx, 'send_group_forward_msg', {
            group_id: 888,
            messages: [{ type: 'node', data: { uin: '20001', name: '爱神', content: [{ type: 'text', data: { text: 'hi' } }] } }],
        });

        expect(response).toMatchObject({ status: 'ok' });
        expect(forwards[0]?.nodes).toEqual([
            { uin: 20001, nickname: '爱神', time: expect.any(Number), segments: [{ type: 'text', content: 'hi' }] },
        ]);
    });

    it('send_private_forward_msg 接受 messages 字段', async () => {
        const { ctx, forwards } = createCtx();
        const response = await handleAction(ctx, 'send_private_forward_msg', {
            user_id: 20001,
            messages: [{ type: 'node', data: { user_id: '20001', nickname: 'Alice', content: 'hi' } }],
        });

        expect(response).toMatchObject({ status: 'ok' });
        expect(forwards[0]?.target).toEqual({ kind: 'private', uin: 20001, uid: 'u_20001' });
    });

    it('forward 段拉取内容后以卡片重新转发', async () => {
        const { ctx, fetched, sent } = createCtx();
        const response = await handleAction(ctx, 'send_group_msg', {
            group_id: 888,
            message: [{ type: 'forward', data: { id: 'res-9' } }],
        });

        expect(response).toMatchObject({ status: 'ok' });
        expect(fetched).toEqual([{ target: { kind: 'group', groupUin: 888 }, resId: 'res-9' }]);

        const segments = sent[0]?.segments as Array<{ type: string; payload: string }>;
        expect(segments).toHaveLength(1);
        const card = JSON.parse(segments[0].payload);
        expect(card.app).toBe('com.tencent.multimsg');
        expect(card.meta.detail).toMatchObject({
            resid: 'res-9',
            summary: '查看1条转发消息',
            news: [{ text: 'Alice: hi' }],
        });
    });

    it('reply 段解析为引用信息', async () => {
        const reply = { sequence: 123, senderUin: 20001, senderUid: 'u_20001', senderName: 'Alice' };
        const { ctx, sent } = createCtx(reply);
        const response = await handleAction(ctx, 'send_group_msg', {
            group_id: 888,
            message: [{ type: 'reply', data: { id: '123' } }, { type: 'text', data: { text: '收到' } }],
        });
        expect(response).toMatchObject({ status: 'ok' });
        expect(sent[0]?.reply).toEqual(reply);
        expect(sent[0]?.segments).toEqual([{ type: 'text', content: '收到' }]);
    });

    it('reply 段未命中缓存时使用最小引用信息', async () => {
        const { ctx, sent } = createCtx();
        await handleAction(ctx, 'send_group_msg', {
            group_id: 888,
            message: [{ type: 'reply', data: { id: '999' } }, { type: 'text', data: { text: 'hi' } }],
        });
        expect(sent[0]?.reply).toEqual({ sequence: 999, senderUin: 0 });
    });

    it('poke 段直接发送戳一戳且不产生消息', async () => {
        const { ctx, pokes, sent } = createCtx();
        const response = await handleAction(ctx, 'send_group_msg', {
            group_id: 888,
            message: [{ type: 'poke', data: { type: '2', id: '20001' } }],
        });
        expect(response).toMatchObject({ status: 'ok', data: { message_id: 0 } });
        expect(pokes).toEqual([{ groupUin: 888, uin: 20001 }]);
        expect(sent).toHaveLength(0);
    });

    it('friend_poke 与 group_poke 动作', async () => {
        const { ctx, pokes } = createCtx();
        await handleAction(ctx, 'friend_poke', { user_id: 20001 });
        await handleAction(ctx, 'group_poke', { group_id: 888, user_id: 20001 });
        expect(pokes).toEqual([{ uin: 20001 }, { groupUin: 888, uin: 20001 }]);
    });

    it('纯文本消息不触发 uid 解析', async () => {
        const { ctx, sent } = createCtx();
        (ctx.friend as unknown as { fetchFriends: () => Promise<never> }).fetchFriends = async () => {
            throw new Error('不应调用好友列表');
        };
        const response = await handleAction(ctx, 'send_private_msg', { user_id: 20001, message: 'hi' });
        expect(response).toMatchObject({ status: 'ok' });
        expect(sent[0]?.segments).toEqual([{ type: 'text', content: 'hi' }]);
    });

    it('撤回消息：调用 recallMessage', async () => {
        const { ctx, recalls } = createCtx();
        const response = await handleAction(ctx, 'delete_msg', { message_id: 42 });
        expect(response).toMatchObject({ status: 'ok' });
        expect(recalls).toEqual([42]);
    });

    it('群禁言：解析 uid 后调用 muteMember', async () => {
        const { ctx, groupActions } = createCtx();
        const response = await handleAction(ctx, 'set_group_ban', { group_id: 888, user_id: 20001, duration: 60 });
        expect(response).toMatchObject({ status: 'ok' });
        expect(groupActions).toEqual([{ name: 'muteMember', args: [888, 'u_20001', 60] }]);
    });

    it('群名片与踢人：解析 uid 后调用', async () => {
        const { ctx, groupActions } = createCtx();
        await handleAction(ctx, 'set_group_card', { group_id: 888, user_id: 20001, card: 'C' });
        await handleAction(ctx, 'set_group_kick', { group_id: 888, user_id: 20001, reject_add_request: true });
        expect(groupActions).toEqual([
            { name: 'setMemberCard', args: [888, 'u_20001', 'C'] },
            { name: 'kickMember', args: [888, 'u_20001', true, ''] },
        ]);
    });

    it('全员禁言与群名', async () => {
        const { ctx, groupActions } = createCtx();
        await handleAction(ctx, 'set_group_whole_ban', { group_id: 888, enable: true });
        await handleAction(ctx, 'set_group_name', { group_id: 888, group_name: 'G' });
        expect(groupActions).toEqual([
            { name: 'muteAllMembers', args: [888, true] },
            { name: 'setGroupName', args: [888, 'G'] },
        ]);
    });

    it('好友点赞', async () => {
        const { ctx, likes } = createCtx();
        await handleAction(ctx, 'send_like', { user_id: 20001, times: 5 });
        expect(likes).toEqual([{ uid: 'u_20001', count: 5 }]);
    });

    it('get_msg 返回缓存的消息数据', async () => {
        const { ctx } = createCtx();
        const response = await handleAction(ctx, 'get_msg', { message_id: 42 });
        expect(response).toMatchObject({
            status: 'ok',
            data: { message_id: 42, user_id: 20001, group_id: 888, raw_message: 'hi' },
        });
        const missed = await handleAction(ctx, 'get_msg', { message_id: 1 });
        expect(missed).toMatchObject({ status: 'failed', retcode: 1404 });
    });

    it('get_group_info 返回群信息', async () => {
        const { ctx } = createCtx();
        const response = await handleAction(ctx, 'get_group_info', { group_id: 888 });
        expect(response).toMatchObject({
            status: 'ok',
            data: { group_id: 888, group_name: '测试群', member_count: 10, max_member_count: 500 },
        });
    });

    it('退群/设管/头衔调用对应群操作', async () => {
        const { ctx, groupActions } = createCtx();
        await handleAction(ctx, 'set_group_leave', { group_id: 888 });
        await handleAction(ctx, 'set_group_admin', { group_id: 888, user_id: 20001, enable: true });
        await handleAction(ctx, 'set_group_special_title', { group_id: 888, user_id: 20001, special_title: '头衔' });
        expect(groupActions).toEqual([
            { name: 'quitGroup', args: [888] },
            { name: 'setMemberAdmin', args: [888, 'u_20001', true] },
            { name: 'setMemberSpecialTitle', args: [888, 'u_20001', '头衔'] },
        ]);
    });

    it('好友申请按 flag 处理', async () => {
        const { ctx, friendActions } = createCtx();
        await handleAction(ctx, 'set_friend_add_request', { flag: 'u_20001', approve: true });
        expect(friendActions).toEqual([{ name: 'handleFriendRequest', args: ['u_20001', true] }]);
    });

    it('加群申请按通知定位序列号后处理', async () => {
        const { ctx, groupActions } = createCtx();
        const response = await handleAction(ctx, 'set_group_add_request', { group_id: 888, flag: 'u_20001', approve: true });
        expect(response).toMatchObject({ status: 'ok' });
        expect(groupActions).toEqual([{ name: 'handleGroupRequest', args: [888, 9, 1, true] }]);

        const missed = await handleAction(ctx, 'set_group_add_request', { group_id: 888, flag: 'u_other', approve: true });
        expect(missed).toMatchObject({ status: 'failed', retcode: 1404 });
    });

    it('get_forward_msg 返回转发节点内容', async () => {
        const { ctx, forwardMessages } = createCtx();
        const response = await handleAction(ctx, 'get_forward_msg', { message_id: 'res-9' });
        expect(response).toMatchObject({
            status: 'ok',
            data: { messages: [{ time: 123, sender: { user_id: 20001, nickname: 'Alice' }, content: [{ type: 'text', data: { text: 'hi' } }] }] },
        });
        expect(forwardMessages[0]?.resId).toBe('res-9');
    });

    it('未知 action 返回失败', async () => {
        const { ctx } = createCtx();
        const response = await handleAction(ctx, 'nonexistent_action', {});
        expect(response).toMatchObject({ status: 'failed', retcode: 1404 });
    });

    it('降级 action 返回成功空结果', async () => {
        const { ctx } = createCtx();
        for (const action of ['_set_model_show', 'set_model_show', 'set_restart', 'set_group_anonymous', 'set_group_anonymous_ban']) {
            const response = await handleAction(ctx, action, {});
            expect(response).toMatchObject({ status: 'ok', data: null });
        }
        expect(await handleAction(ctx, 'get_online_clients', {})).toMatchObject({ status: 'ok', data: { clients: [] } });
        expect(await handleAction(ctx, 'get_guild_list', {})).toMatchObject({ status: 'ok', data: [] });
        expect(await handleAction(ctx, 'get_guild_service_profile', {})).toMatchObject({ status: 'ok', data: null });
        expect(await handleAction(ctx, '_get_model_show', {})).toMatchObject({ status: 'ok', data: { variants: [] } });
        expect(await handleAction(ctx, 'get_group_honor_info', { group_id: 888 })).toMatchObject({
            status: 'ok',
            data: { group_id: 888, talkative_list: [], performer_list: [], legend_list: [], strong_newbie_list: [], emotion_list: [] },
        });
    });

    it('get_cookies 返回拼接后的 Cookie 串', async () => {
        const { ctx, cookieQueries } = createCtx();
        const response = await handleAction(ctx, 'get_cookies', {});
        expect(response).toMatchObject({ status: 'ok', data: { cookies: 'p_skey=abc; skey=def' } });
        expect(cookieQueries[0]).toContain('qun.qq.com');

        const single = await handleAction(ctx, 'get_cookies', { domain: 'docs.qq.com' });
        expect(single).toMatchObject({ status: 'ok' });
        expect(cookieQueries[1]).toEqual(['docs.qq.com']);
    });

    it('get_csrf_token 返回本地计算的 bkn', async () => {
        const { ctx } = createCtx();
        expect(await handleAction(ctx, 'get_csrf_token', {})).toMatchObject({ status: 'ok', data: { token: 123456 } });
    });

    it('get_credentials 同时返回 Cookie 与 csrf_token', async () => {
        const { ctx } = createCtx();
        expect(await handleAction(ctx, 'get_credentials', {})).toMatchObject({
            status: 'ok',
            data: { cookies: 'p_skey=abc; skey=def', csrf_token: 123456 },
        });
    });

    it('get_roam_msg 按 uid 拉取漫游消息', async () => {
        const { ctx, roamQueries } = createCtx();
        const response = await handleAction(ctx, 'get_roam_msg', { user_id: 20001, count: 5 });
        expect(response).toMatchObject({ status: 'ok', data: { messages: [{ message_id: expect.any(Number) }] } });
        expect(roamQueries[0]).toMatchObject({ uid: 'u_20001', count: 5 });
    });

    it('upload_group_file 上传群文件', async () => {
        const { ctx, groupFileActions } = createCtx();
        const response = await handleAction(ctx, 'upload_group_file', {
            group_id: 888,
            file: 'data:text/plain;base64,SGVsbG8=',
            name: 'log.txt',
            folder: '/docs',
        });
        expect(response).toMatchObject({ status: 'ok' });
        expect(groupFileActions).toEqual([{ name: 'upload', args: [888, '/docs', 'log.txt'] }]);
    });

    it('upload_private_file 上传私聊文件', async () => {
        const { ctx, privateFileActions } = createCtx();
        const response = await handleAction(ctx, 'upload_private_file', {
            user_id: 20001,
            file: 'data:text/plain;base64,SGVsbG8=',
            name: 'log.txt',
        });
        expect(response).toMatchObject({ status: 'ok' });
        expect(privateFileActions).toEqual([{ name: 'upload', args: [20001, 'u_20001', 'log.txt'] }]);
    });

    it('群文件 URL / 删除 / 重命名 / 移动', async () => {
        const { ctx, groupFileActions } = createCtx();
        expect(await handleAction(ctx, 'get_group_file_url', { group_id: 888, file_id: 'f1' })).toMatchObject({
            status: 'ok',
            data: { url: 'https://example.com/file' },
        });
        await handleAction(ctx, 'delete_group_file', { group_id: 888, file_id: 'f1' });
        await handleAction(ctx, 'rename_group_file', { group_id: 888, file_id: 'f1', current_parent_directory: '/a', new_name: 'b.txt' });
        await handleAction(ctx, 'move_group_file', { group_id: 888, file_id: 'f1', current_parent_directory: '/a', target_parent_directory: '/c' });
        expect(groupFileActions).toEqual([
            { name: 'getDownloadUrl', args: [888, 'f1'] },
            { name: 'delete', args: [888, 'f1'] },
            { name: 'rename', args: [888, 'f1', '/a', 'b.txt'] },
            { name: 'move', args: [888, 'f1', '/a', '/c'] },
        ]);
    });

    it('send_group_forward_msg 复用群消息发送', async () => {
        const { ctx, sent } = createCtx();
        const response = await handleAction(ctx, 'send_group_forward_msg', {
            group_id: 888,
            message: [{ type: 'node', data: { user_id: '20001', nickname: 'Alice', content: 'hi' } }],
        });
        expect(response).toMatchObject({ status: 'ok' });
        expect(sent[0]).toMatchObject({ groupUin: 888 });
    });

    it('send_msg 依据 group_id 路由到群聊', async () => {
        const { ctx, sent } = createCtx();
        const response = await handleAction(ctx, 'send_msg', { group_id: 888, message: 'hi' });
        expect(response).toMatchObject({ status: 'ok', data: { message_id: 7 } });
        expect(sent[0]).toMatchObject({ groupUin: 888 });
        expect(sent[0]?.uin).toBeUndefined();
    });

    it('send_msg 群聊含图片时不会误判为私聊', async () => {
        const { ctx, images, sent } = createCtx();
        const response = await handleAction(ctx, 'send_msg', {
            group_id: 888,
            message: [{ type: 'image', data: { file: pngBase64(2, 2) } }],
        });
        expect(response).toMatchObject({ status: 'ok' });
        expect(images).toEqual([{ target: 888, width: 2, height: 2 }]);
        expect(sent[0]).toMatchObject({ groupUin: 888 });
    });

    it('send_msg 依据 user_id 路由到私聊', async () => {
        const { ctx, sent } = createCtx();
        const response = await handleAction(ctx, 'send_msg', { user_id: 20001, message: 'hi' });
        expect(response).toMatchObject({ status: 'ok', data: { message_id: 8 } });
        expect(sent[0]).toMatchObject({ uin: 20001 });
    });
});
