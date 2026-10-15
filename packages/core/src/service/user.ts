import { UserInfoKey } from '../common/user-info.js';
import { fetchUserInfoByUidContract, fetchUserInfoByUinContract, fetchUserInfoResponseContract } from '../packet/oidb/index.js';
import type { OidbService } from './oidb.js';

/** 用户信息。 */
export interface UserInfo {
    uin: number;
    nickname?: string;
    remark?: string;
    bio?: string;
    qid?: string;
    city?: string;
    country?: string;
    school?: string;
    age?: number;
    gender?: number;
    level?: number;
    registerTime?: number;
}

/** 默认请求的用户信息字段。 */
const DEFAULT_KEYS = [
    UserInfoKey.Avatar,
    UserInfoKey.Bio,
    UserInfoKey.Remark,
    UserInfoKey.Level,
    UserInfoKey.BusinessList,
    UserInfoKey.Nickname,
    UserInfoKey.Country,
    UserInfoKey.Gender,
    UserInfoKey.City,
    UserInfoKey.School,
    UserInfoKey.RegisterTime,
    UserInfoKey.Age,
    UserInfoKey.Qid,
];

/** 用户信息接口。 */
export class UserService {
    constructor(private readonly oidb: OidbService) {}

    /** 按 uin 或 uid 拉取用户信息。 */
    async fetchUserInfo(uinOrUid: number | string, keys: UserInfoKey[] = DEFAULT_KEYS): Promise<UserInfo> {
        const keyList = keys.map((key) => ({ key }));
        const response =
            typeof uinOrUid === 'number'
                ? await this.oidb.call(fetchUserInfoByUinContract, fetchUserInfoResponseContract, { uin: uinOrUid, keys: keyList })
                : await this.oidb.call(fetchUserInfoByUidContract, fetchUserInfoResponseContract, { uid: uinOrUid, keys: keyList });

        const numbers = new Map(response.body.properties.numberProperties.map((prop) => [prop.key, prop.value]));
        const bytesMap = new Map(response.body.properties.bytesProperties.map((prop) => [prop.key, prop.value]));
        return {
            uin: response.body.uin,
            nickname: bytesMap.get(UserInfoKey.Nickname)?.toString(),
            remark: bytesMap.get(UserInfoKey.Remark)?.toString(),
            bio: bytesMap.get(UserInfoKey.Bio)?.toString(),
            qid: bytesMap.get(UserInfoKey.Qid)?.toString(),
            city: bytesMap.get(UserInfoKey.City)?.toString(),
            country: bytesMap.get(UserInfoKey.Country)?.toString(),
            school: bytesMap.get(UserInfoKey.School)?.toString(),
            age: numbers.get(UserInfoKey.Age),
            gender: numbers.get(UserInfoKey.Gender),
            level: numbers.get(UserInfoKey.Level),
            registerTime: numbers.get(UserInfoKey.RegisterTime),
        };
    }
}