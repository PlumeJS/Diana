import { createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { LINUX_APP_INFO } from '../../src/common/app-info.js';
import { newDeviceInfo } from '../../src/common/device-info.js';
import { UserInfoKey } from '../../src/common/user-info.js';
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
    fetchFriendsResponseContract,
    fetchGroupMembersResponseContract,
    fetchGroupNotificationsResponseContract,
    fetchGroupsResponseContract,
    fetchUserInfoResponseContract,
    GroupMemberPermission,
    kickMemberContract,
    muteAllMembersContract,
    muteMemberContract,
    nudgeContract,
    OidbBase,
    sendProfileLikeContract,
    setGroupNameContract,
    setMemberCardContract,
} from '../../src/packet/oidb/index.js';
import { FriendService, GroupService, OidbService, SsoTransport, UserService } from '../../src/service/index.js';
import { decodeTlv, encodeTlv } from '../../src/tlv/index.js';
import type { TlvData } from '../../src/tlv/index.js';
import { decryptTea, encryptTea } from '../../src/crypto/tea.js';

const FRIENDS_COMMAND = 'OidbSvcTrpcTcp.0xfd4_1';
const GROUPS_COMMAND = 'OidbSvcTrpcTcp.0xfe5_2';
const MEMBERS_COMMAND = 'OidbSvcTrpcTcp.0xfe7_3';
const USER_INFO_COMMAND = 'OidbSvcTrpcTcp.0xfe1_2';
const GROUP_NOTIFY_COMMAND = 'OidbSvcTrpcTcp.0x10c0_1';
const NUDGE_COMMAND = 'OidbSvcTrpcTcp.0xed3_1';

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

function buildFriendsResponse(): Buffer {
    return fetchFriendsResponseContract.encode({
        selfUin: 10000,
        displayFriendCount: 1,
        friends: [
            {
                uid: 'u_friend',
                uin: 20001,
                categoryId: 5,
                additional: [
                    {
                        type: 1,
                        layer1: {
                            numData: [
                                { code: UserInfoKey.Age, value: 18 },
                                { code: UserInfoKey.Gender, value: 1 },
                            ],
                            strData: [
                                { code: UserInfoKey.Nickname, value: 'Alice' },
                                { code: UserInfoKey.Remark, value: 'rem' },
                                { code: UserInfoKey.Bio, value: 'hi' },
                                { code: UserInfoKey.Qid, value: 'qid1' },
                            ],
                        },
                    },
                ],
            },
        ],
        friendCategories: [{ code: 5, value: 'default' }],
    });
}

function buildGroupsResponse(): Buffer {
    return fetchGroupsResponseContract.encode({
        groups: [
            {
                groupUin: 111,
                info: {
                    groupOwner: { uid: 'u_owner' },
                    createdTime: 1,
                    memberMax: 500,
                    memberCount: 3,
                    groupName: 'G1',
                    description: 'd',
                    question: 'q',
                    announcement: 'a',
                },
            },
        ],
    });
}

function buildMembersResponse(): Buffer {
    return fetchGroupMembersResponseContract.encode({
        groupUin: 111,
        members: [
            {
                identity: { uin: 20001, uid: 'u_m' },
                memberName: 'M1',
                specialTitle: Buffer.from('title'),
                memberCard: { value: 'card' },
                level: { level: 7, infos: [] },
                joinTimestamp: 100,
                lastMsgTimestamp: 200,
                permission: GroupMemberPermission.Owner,
            },
        ],
        token: 'tok',
    });
}

function buildUserInfoResponse(): Buffer {
    return fetchUserInfoResponseContract.encode({
        body: {
            uin: 20001,
            properties: {
                numberProperties: [
                    { key: UserInfoKey.Age, value: 18 },
                    { key: UserInfoKey.Gender, value: 1 },
                    { key: UserInfoKey.Level, value: 9 },
                ],
                bytesProperties: [
                    { key: UserInfoKey.Nickname, value: Buffer.from('Alice') },
                    { key: UserInfoKey.City, value: Buffer.from('SH') },
                ],
            },
        },
    });
}

function buildGroupNotificationsResponse(): Buffer {
    return fetchGroupNotificationsResponseContract.encode({
        notifications: [
            {
                sequence: 5n,
                type: 1n,
                state: 1n,
                group: { groupUin: 111n },
                target: { uid: 'u_target' },
                invitor: { uid: 'u_invitor' },
                operator: { uid: 'u_op' },
                comment: 'hi',
            },
        ],
    });
}

const cleanups: Array<() => void> = [];

afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
        cleanup();
    }
});

interface Services {
    friend: FriendService;
    group: GroupService;
    user: UserService;
}

async function setup(
    responses: Record<string, () => Buffer>,
    onRequest?: (command: string, body: Buffer) => void,
): Promise<Services> {
    const appInfo = LINUX_APP_INFO;
    const deviceInfo = newDeviceInfo();

    const server: Server = createServer((socket: Socket) => {
        const reader = new SsoFrameReader();
        socket.on('data', (chunk) => {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            for (const frame of reader.push(buffer)) {
                const { command, sequence, body } = parseOutgoing(frame);
                onRequest?.(command, body);
                const build = responses[command];
                if (!build) {
                    continue;
                }
                socket.write(encodeSsoFrame(buildIncoming(command, sequence, build())));
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
        },
        session: {
            uin: '10000',
            a2: Buffer.alloc(0),
            d2: Buffer.alloc(0),
            d2Key: Buffer.alloc(0),
            subAppId: appInfo.SubAppId,
            guid: deviceInfo.guid.toString('hex'),
            version: appInfo.CurrentVersion,
        },
    });
    await transport.connect();

    cleanups.push(() => {
        transport.close();
        server.close();
    });

    const oidb = new OidbService(transport);
    return { friend: new FriendService(oidb), group: new GroupService(oidb), user: new UserService(oidb) };
}

describe('OIDB 业务接口', () => {
    it('拉取好友列表并解析字段', async () => {
        const { friend } = await setup({ [FRIENDS_COMMAND]: buildFriendsResponse });
        const result = await friend.fetchFriends();
        expect(result.friends).toHaveLength(1);
        expect(result.friends[0]).toMatchObject({
            uin: 20001,
            uid: 'u_friend',
            nickname: 'Alice',
            remark: 'rem',
            bio: 'hi',
            qid: 'qid1',
            age: 18,
            gender: 1,
            categoryId: 5,
        });
        expect(result.categories).toEqual([{ code: 5, value: 'default' }]);
    });

    it('拉取群列表并解析字段', async () => {
        const { group } = await setup({ [GROUPS_COMMAND]: buildGroupsResponse });
        const groups = await group.fetchGroups();
        expect(groups).toEqual([
            {
                groupUin: 111,
                ownerUid: 'u_owner',
                createdTime: 1,
                memberMax: 500,
                memberCount: 3,
                name: 'G1',
                description: 'd',
                question: 'q',
                announcement: 'a',
            },
        ]);
    });

    it('拉取群成员并解析字段', async () => {
        const { group } = await setup({ [MEMBERS_COMMAND]: buildMembersResponse });
        const result = await group.fetchGroupMembers(111);
        expect(result.token).toBe('tok');
        expect(result.members).toHaveLength(1);
        expect(result.members[0]).toMatchObject({
            uin: 20001,
            uid: 'u_m',
            nickname: 'M1',
            card: 'card',
            level: 7,
            specialTitle: 'title',
            joinTimestamp: 100,
            lastMsgTimestamp: 200,
            permission: GroupMemberPermission.Owner,
        });
    });

    it('拉取用户信息并解析属性', async () => {
        const { user } = await setup({ [USER_INFO_COMMAND]: buildUserInfoResponse });
        const info = await user.fetchUserInfo(20001);
        expect(info).toMatchObject({
            uin: 20001,
            nickname: 'Alice',
            city: 'SH',
            age: 18,
            gender: 1,
            level: 9,
        });
    });

    it('拉取群通知并解析字段', async () => {
        const { group } = await setup({ [GROUP_NOTIFY_COMMAND]: buildGroupNotificationsResponse });
        const notifications = await group.fetchGroupNotifications(10);
        expect(notifications).toEqual([
            {
                sequence: 5,
                type: 1,
                state: 1,
                groupUin: 111,
                targetUid: 'u_target',
                invitorUid: 'u_invitor',
                operatorUid: 'u_op',
                comment: 'hi',
            },
        ]);
    });

    it('OIDB 返回错误码时抛出异常', async () => {
        const { friend } = await setup({
            [FRIENDS_COMMAND]: () => OidbBase.encode({ command: 0xfd4, subCommand: 1, errorCode: 1, errorMsg: 'boom', properties: [], reserved: 0 }),
        });
        await expect(friend.fetchFriends()).rejects.toThrow(/OIDB 请求失败/);
    });
});

/** 构造一个 OIDB 成功响应（无业务体）。 */
function oidbOk(command: number, subCommand: number): () => Buffer {
    return () => OidbBase.encode({ command, subCommand, errorCode: 0, errorMsg: '', properties: [], reserved: 0 });
}

describe('群管理与点赞动作', () => {
    it('禁言群成员', async () => {
        const captured: Array<{ command: string; body: Buffer }> = [];
        const { group } = await setup({ 'OidbSvcTrpcTcp.0x1253_1': oidbOk(0x1253, 1) }, (command, body) =>
            captured.push({ command, body }),
        );
        await group.muteMember(111, 'u_m', 60);
        expect(muteMemberContract.tryDecode(captured[0].body).body).toEqual({
            groupUin: 111,
            type: 1,
            body: { targetUid: 'u_m', duration: 60 },
        });
    });

    it('开启全员禁言', async () => {
        const captured: Array<{ command: string; body: Buffer }> = [];
        const { group } = await setup({ 'OidbSvcTrpcTcp.0x89a_0': oidbOk(0x89a, 0) }, (command, body) =>
            captured.push({ command, body }),
        );
        await group.muteAllMembers(111, true);
        expect(muteAllMembersContract.tryDecode(captured[0].body).body).toEqual({ groupUin: 111, body: { duration: 1 } });
    });

    it('设置群成员名片', async () => {
        const captured: Array<{ command: string; body: Buffer }> = [];
        const { group } = await setup({ 'OidbSvcTrpcTcp.0x8fc_3': oidbOk(0x8fc, 3) }, (command, body) =>
            captured.push({ command, body }),
        );
        await group.setMemberCard(111, 'u_m', 'card-x');
        expect(setMemberCardContract.tryDecode(captured[0].body).body).toEqual({
            groupUin: 111,
            body: { targetUid: 'u_m', card: 'card-x' },
        });
    });

    it('移出群成员', async () => {
        const captured: Array<{ command: string; body: Buffer }> = [];
        const { group } = await setup({ 'OidbSvcTrpcTcp.0x8a0_1': oidbOk(0x8a0, 1) }, (command, body) =>
            captured.push({ command, body }),
        );
        await group.kickMember(111, 'u_m', true, '');
        expect(kickMemberContract.tryDecode(captured[0].body).body).toEqual({
            groupUin: 111,
            memberUid: 'u_m',
            rejectSubsequentRequests: true,
            reason: '',
        });
    });

    it('设置群名称', async () => {
        const captured: Array<{ command: string; body: Buffer }> = [];
        const { group } = await setup({ 'OidbSvcTrpcTcp.0x89a_15': oidbOk(0x89a, 15) }, (command, body) =>
            captured.push({ command, body }),
        );
        await group.setGroupName(111, '新群名');
        expect(setGroupNameContract.tryDecode(captured[0].body).body).toEqual({ groupUin: 111, body: { name: '新群名' } });
    });

    it('给好友点赞', async () => {
        const captured: Array<{ command: string; body: Buffer }> = [];
        const { friend } = await setup({ 'OidbSvcTrpcTcp.0x7e5_104': oidbOk(0x7e5, 104) }, (command, body) =>
            captured.push({ command, body }),
        );
        await friend.sendLike('u_friend', 3);
        expect(sendProfileLikeContract.tryDecode(captured[0].body).body).toEqual({
            targetUid: 'u_friend',
            field12: 71,
            count: 3,
        });
    });

    it('戳一戳群成员与好友', async () => {
        const captured: Array<{ command: string; body: Buffer }> = [];
        const { group, friend } = await setup({ [NUDGE_COMMAND]: oidbOk(0xed3, 1) }, (command, body) =>
            captured.push({ command, body }),
        );
        await group.pokeMember(111, 20001);
        await friend.poke(20002);

        expect(captured.map((item) => item.command)).toEqual([NUDGE_COMMAND, NUDGE_COMMAND]);
        expect(nudgeContract.tryDecode(captured[0].body).body).toMatchObject({ toUin: 20001n, groupCode: 111n });
        expect(nudgeContract.tryDecode(captured[1].body).body).toMatchObject({ toUin: 20002n, aioUin: 20002n });
    });
});
