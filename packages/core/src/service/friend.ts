import type { UserInfoGender } from '../common/user-info.js';
import { UserInfoKey } from '../common/user-info.js';
import {
    fetchFriendsContract,
    fetchFriendsResponseContract,
    nudgeContract,
    sendProfileLikeContract,
    setFriendRequestContract,
} from '../packet/oidb/index.js';
import type { OidbService } from './oidb.js';

/** 好友信息。 */
export interface Friend {
    uin: number;
    uid: string;
    nickname: string;
    remark: string;
    bio: string;
    qid: string;
    age: number;
    gender: UserInfoGender;
    categoryId: number;
}

/** 好友分组。 */
export interface FriendCategory {
    code: number;
    value: string;
}

/** 拉取好友列表的参数。 */
export interface FetchFriendsOptions {
    nextUin?: number;
    count?: number;
}

/** 好友列表结果。 */
export interface FetchFriendsResult {
    nextUin?: number;
    friends: Friend[];
    categories: FriendCategory[];
}

/** 好友相关接口。 */
export class FriendService {
    constructor(private readonly oidb: OidbService) {}

    /** 拉取好友列表（分页）。 */
    async fetchFriends(options: FetchFriendsOptions = {}): Promise<FetchFriendsResult> {
        const response = await this.oidb.call(fetchFriendsContract, fetchFriendsResponseContract, {
            friendCount: options.count ?? 300,
            field6: 1,
            queried: [
                {
                    type: 1,
                    fields: {
                        numbers: [
                            UserInfoKey.Bio,
                            UserInfoKey.Remark,
                            UserInfoKey.Nickname,
                            UserInfoKey.Qid,
                            UserInfoKey.Age,
                            UserInfoKey.Gender,
                        ],
                    },
                },
                { type: 4, fields: { numbers: [100, 101, 102] } },
            ],
            nextUin: options.nextUin ? { uin: options.nextUin } : undefined,
        });

        const friends: Friend[] = (response.friends ?? []).map((raw) => {
            const layer1 = raw.additional.find((item) => item.type === 1)?.layer1;
            const numData = layer1?.numData ?? [];
            const strData = layer1?.strData ?? [];
            const findNumber = (code: number): number => numData.find((prop) => prop.code === code)?.value ?? 0;
            const findString = (code: number): string => strData.find((prop) => prop.code === code)?.value ?? '';
            return {
                uin: raw.uin,
                uid: raw.uid,
                nickname: findString(UserInfoKey.Nickname),
                remark: findString(UserInfoKey.Remark),
                bio: findString(UserInfoKey.Bio),
                qid: findString(UserInfoKey.Qid),
                age: findNumber(UserInfoKey.Age),
                gender: findNumber(UserInfoKey.Gender) as UserInfoGender,
                categoryId: raw.categoryId,
            };
        });

        return {
            nextUin: response.next?.uin,
            friends,
            categories: (response.friendCategories ?? []).map((category) => ({
                code: category.code,
                value: category.value ?? '',
            })),
        };
    }

    /** 给好友点赞。 */
    async sendLike(targetUid: string, count = 1): Promise<void> {
        await this.oidb.send(sendProfileLikeContract, { targetUid, field12: 71, count });
    }

    /** 戳一戳好友。 */
    async poke(uin: number): Promise<void> {
        await this.oidb.send(nudgeContract, { toUin: BigInt(uin), aioUin: BigInt(uin) });
    }

    /** 同意/拒绝好友申请。 */
    async handleFriendRequest(targetUid: string, accept: boolean): Promise<void> {
        await this.oidb.send(setFriendRequestContract, { accept: accept ? 3 : 5, targetUid });
    }
}