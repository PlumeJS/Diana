import { ProtoField, ProtoMessage, ScalarType } from '../pb/index.js';
import { PushMsgBody } from './message/push.js';

/** 上报给服务器的设备信息。 */
export const RegisterDeviceInfo = ProtoMessage.of({
    user: ProtoField(1, ScalarType.STRING),
    os: ProtoField(2, ScalarType.STRING),
    osVer: ProtoField(3, ScalarType.STRING),
    vendorName: ProtoField(4, ScalarType.STRING, { optional: true }),
    osLower: ProtoField(5, ScalarType.STRING),
});

/** 上线注册信息。 */
export const RegisterInfo = ProtoMessage.of({
    guid: ProtoField(1, ScalarType.STRING, { optional: true }),
    kickPC: ProtoField(2, ScalarType.INT32, { optional: true }),
    currentVersion: ProtoField(3, ScalarType.STRING, { optional: true }),
    isFirstRegisterProxyOnline: ProtoField(4, ScalarType.INT32, { optional: true }),
    localeId: ProtoField(5, ScalarType.INT32, { optional: true }),
    device: ProtoField(6, () => RegisterDeviceInfo.fields, { optional: true }),
    setMute: ProtoField(7, ScalarType.INT32, { optional: true }),
    registerVendorType: ProtoField(8, ScalarType.INT32, { optional: true }),
    regType: ProtoField(9, ScalarType.INT32, { optional: true }),
    businessInfo: ProtoField(
        10,
        () => ({
            notifySwitch: ProtoField(1, ScalarType.UINT32),
            bindUinNotifySwitch: ProtoField(2, ScalarType.UINT32),
        }),
        { optional: true },
    ),
    batteryStatus: ProtoField(11, ScalarType.INT32, { optional: true }),
    field12: ProtoField(12, ScalarType.UINT32, { optional: true }),
});

/** 注册结果。 */
export const RegisterInfoResponse = ProtoMessage.of({
    message: ProtoField(2, ScalarType.STRING, { optional: true }),
    timestamp: ProtoField(3, ScalarType.UINT32, { optional: true }),
});

/** C2C 消息 cookie。 */
export const SsoC2CMsgCookie = ProtoMessage.of({
    c2cLastMsgTime: ProtoField(1, ScalarType.UINT64),
});

/** 上线同步请求。 */
export const SsoInfoSync = ProtoMessage.of({
    syncFlag: ProtoField(1, ScalarType.UINT32),
    reqRandom: ProtoField(2, ScalarType.UINT32, { optional: true }),
    curActiveStatus: ProtoField(4, ScalarType.UINT32, { optional: true }),
    groupLastMsgTime: ProtoField(5, ScalarType.UINT64, { optional: true }),
    c2cInfoSync: ProtoField(
        6,
        () => ({
            c2cMsgCookie: ProtoField(1, () => SsoC2CMsgCookie.fields, { optional: true }),
            c2cLastMsgTime: ProtoField(2, ScalarType.UINT64),
            lastC2cMsgCookie: ProtoField(3, () => SsoC2CMsgCookie.fields, { optional: true }),
        }),
        { optional: true },
    ),
    registerInfo: ProtoField(9, () => RegisterInfo.fields, { optional: true }),
    unknownStructure: ProtoField(
        10,
        () => ({
            groupCode: ProtoField(1, ScalarType.UINT32, { optional: true }),
            flag2: ProtoField(2, ScalarType.UINT32),
        }),
        { optional: true },
    ),
    appState: ProtoField(
        11,
        () => ({
            isDelayRequest: ProtoField(1, ScalarType.UINT32, { optional: true }),
            appStatus: ProtoField(2, ScalarType.UINT32, { optional: true }),
            silenceStatus: ProtoField(3, ScalarType.UINT32, { optional: true }),
        }),
        { optional: true },
    ),
});

/** 上线同步响应。 */
export const SsoInfoSyncResponse = ProtoMessage.of({
    registerInfoResponse: ProtoField(7, () => RegisterInfoResponse.fields, { optional: true }),
});

/** 心跳请求。 */
export const SsoHeartBeat = ProtoMessage.of({
    type: ProtoField(1, ScalarType.INT32),
});

/** 心跳响应，`interval` 为下一次心跳间隔。 */
export const SsoHeartBeatResponse = ProtoMessage.of({
    interval: ProtoField(1, ScalarType.UINT32),
});

/** 被踢下线推送。 */
export const KickNTReq = ProtoMessage.of({
    uin: ProtoField(1, ScalarType.INT64),
    isSameDevice: ProtoField(2, ScalarType.BOOL),
    tipsInfo: ProtoField(3, ScalarType.STRING),
    tipsTitle: ProtoField(4, ScalarType.STRING),
});

/** 下线上报。 */
export const UnRegisterInfo = ProtoMessage.of({
    device: ProtoField(2, () => RegisterDeviceInfo.fields),
});

/** 会话节点（信息同步推送）。 */
export const InfoSyncGroupNode = ProtoMessage.of({
    groupCode: ProtoField(1, ScalarType.UINT64, { optional: true }),
    groupSeq: ProtoField(2, ScalarType.UINT64, { optional: true }),
    readMsgSeq: ProtoField(3, ScalarType.UINT64, { optional: true }),
    mask: ProtoField(4, ScalarType.UINT64, { optional: true }),
    longestMsgTime: ProtoField(5, ScalarType.UINT64, { optional: true }),
    hasMessage: ProtoField(6, ScalarType.BOOL, { optional: true }),
    latestMsgTime: ProtoField(8, ScalarType.UINT64, { optional: true }),
    peerName: ProtoField(9, ScalarType.STRING, { optional: true }),
    longestMsgSeq: ProtoField(10, ScalarType.UINT64, { optional: true }),
    uinFlagEx2: ProtoField(11, ScalarType.UINT64, { optional: true }),
    importantMsgLatestSeq: ProtoField(12, ScalarType.UINT32, { optional: true }),
    groupMaxEventSeq: ProtoField(13, ScalarType.UINT32, { optional: true }),
    random: ProtoField(14, ScalarType.UINT32, { optional: true }),
    needToCheckSeqOnAioOpen: ProtoField(15, ScalarType.UINT32, { optional: true }),
});

/** 群系统通知条目。 */
export const InfoSyncGroupNotification = ProtoMessage.of({
    groupUin: ProtoField(3, ScalarType.INT64, { optional: true }),
    startSeq: ProtoField(4, ScalarType.UINT32, { optional: true }),
    endSeq: ProtoField(5, ScalarType.UINT32, { optional: true }),
    messages: ProtoField(6, () => PushMsgBody.fields, { repeated: true }),
    lastSpeakTimestamp: ProtoField(8, ScalarType.INT64, { optional: true }),
});

/** 群系统通知集合。 */
export const InfoSyncGroupNotifications = ProtoMessage.of({
    notifications: ProtoField(3, () => InfoSyncGroupNotification.fields, { repeated: true }),
});

/** 系统通知条目。 */
export const InfoSyncSystemNotification = ProtoMessage.of({
    peerUin: ProtoField(1, ScalarType.INT64, { optional: true }),
    peerUid: ProtoField(2, ScalarType.STRING, { optional: true }),
    lastSpeakTimestamp: ProtoField(5, ScalarType.INT64, { optional: true }),
    messages: ProtoField(8, () => PushMsgBody.fields, { repeated: true }),
});

/** 系统通知集合。 */
export const InfoSyncSystemNotifications = ProtoMessage.of({
    notifications: ProtoField(4, () => InfoSyncSystemNotification.fields, { repeated: true }),
});

/** 信息同步推送。 */
export const InfoSyncPush = ProtoMessage.of({
    result: ProtoField(1, ScalarType.UINT32, { optional: true }),
    errorMsg: ProtoField(2, ScalarType.STRING, { optional: true }),
    pushFlag: ProtoField(3, ScalarType.UINT32, { optional: true }),
    pushSeq: ProtoField(4, ScalarType.UINT32, { optional: true }),
    retryFlag: ProtoField(5, ScalarType.UINT32, { optional: true }),
    groupNodes: ProtoField(6, () => InfoSyncGroupNode.fields, { repeated: true }),
    notifications: ProtoField(7, () => InfoSyncGroupNotifications.fields, { optional: true }),
    sysNotifications: ProtoField(8, () => InfoSyncSystemNotifications.fields, { optional: true }),
});
