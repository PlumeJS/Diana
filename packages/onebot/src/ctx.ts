import type {
    EssenceService,
    FriendService,
    GroupFileService,
    GroupService,
    HighwayService,
    MediaService,
    MessageService,
    NotifyService,
    PrivateFileService,
    SsoTransport,
    SystemService,
    UserService,
} from '@diana/core';

/** OneBot 服务端依赖的核心服务集合。 */
export interface OneBotContext {
    /** 机器人自身 QQ 号。 */
    selfId: number;
    /** 客户端协议版本（AppInfo.CurrentVersion），群打卡等协议需要。 */
    appVersion: string;
    transport: SsoTransport;
    message: MessageService;
    notify: NotifyService;
    friend: FriendService;
    group: GroupService;
    user: UserService;
    media: MediaService;
    groupFile: GroupFileService;
    privateFile: PrivateFileService;
    /** 群精华消息服务。 */
    essence: EssenceService;
    highway: HighwayService;
    /** 系统服务（表情详情等）。 */
    system: SystemService;
}