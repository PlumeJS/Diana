/** 用户信息字段枚举。 */
export enum UserInfoKey {
    /** 头像 URL。 */
    Avatar = 101,
    /** 个性签名。 */
    Bio = 102,
    /** 备注。 */
    Remark = 103,
    /** QQ 等级。 */
    Level = 105,
    /** 业务列表。 */
    BusinessList = 107,
    /** 昵称。 */
    Nickname = 20002,
    /** 国家。 */
    Country = 20003,
    /** 性别。 */
    Gender = 20009,
    /** 城市。 */
    City = 20020,
    /** 学校。 */
    School = 20021,
    /** 注册时间（Unix 秒）。 */
    RegisterTime = 20026,
    /** 年龄。 */
    Age = 20037,
    /** QID。 */
    Qid = 27394,
}

/** 用户性别。 */
export enum UserInfoGender {
    Unset = 0,
    Male = 1,
    Female = 2,
    Unknown = 255,
}