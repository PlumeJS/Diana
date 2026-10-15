import { ProtoField, ProtoMessage, ScalarType } from '../../pb/index.js';
import { PushMsgBody } from './push.js';

/** 拉取群历史消息请求。 */
export const SsoGetGroupMsg = ProtoMessage.of({
    info: ProtoField(
        1,
        () => ({
            groupUin: ProtoField(1, ScalarType.INT64),
            startSequence: ProtoField(2, ScalarType.UINT64),
            endSequence: ProtoField(3, ScalarType.UINT64),
        }),
        { optional: true },
    ),
    filter: ProtoField(2, ScalarType.UINT32, { optional: true }),
});

/** 拉取群历史消息响应。 */
export const SsoGetGroupMsgResponse = ProtoMessage.of({
    retCode: ProtoField(1, ScalarType.UINT32, { optional: true }),
    errorMsg: ProtoField(2, ScalarType.STRING, { optional: true }),
    body: ProtoField(
        3,
        () => ({
            retcode: ProtoField(1, ScalarType.UINT32, { optional: true }),
            message: ProtoField(2, ScalarType.STRING, { optional: true }),
            groupUin: ProtoField(3, ScalarType.UINT32, { optional: true }),
            startSequence: ProtoField(4, ScalarType.UINT64, { optional: true }),
            endSequence: ProtoField(5, ScalarType.UINT64, { optional: true }),
            messages: ProtoField(6, () => PushMsgBody.fields, { repeated: true }),
        }),
        { optional: true },
    ),
});

/** 拉取私聊历史消息请求。 */
export const SsoGetC2CMsg = ProtoMessage.of({
    peerUin: ProtoField(1, ScalarType.INT64, { optional: true }),
    peerUid: ProtoField(2, ScalarType.STRING, { optional: true }),
    startSequence: ProtoField(3, ScalarType.UINT64),
    endSequence: ProtoField(4, ScalarType.UINT64),
});

/** 拉取私聊历史消息响应。 */
export const SsoGetC2CMsgResponse = ProtoMessage.of({
    retcode: ProtoField(1, ScalarType.UINT32, { optional: true }),
    message: ProtoField(2, ScalarType.STRING, { optional: true }),
    startSequence: ProtoField(3, ScalarType.UINT64, { optional: true }),
    endSequence: ProtoField(4, ScalarType.UINT64, { optional: true }),
    messages: ProtoField(7, () => PushMsgBody.fields, { repeated: true }),
});

/** 拉取漫游消息请求。 */
export const SsoGetRoamMsg = ProtoMessage.of({
    peerUid: ProtoField(1, ScalarType.STRING),
    time: ProtoField(2, ScalarType.UINT32),
    random: ProtoField(3, ScalarType.UINT32),
    count: ProtoField(4, ScalarType.UINT32),
    direction: ProtoField(5, ScalarType.UINT32),
});

/** 拉取漫游消息响应。 */
export const SsoGetRoamMsgResponse = ProtoMessage.of({
    peerUid: ProtoField(3, ScalarType.STRING, { optional: true }),
    isComplete: ProtoField(4, ScalarType.BOOL, { optional: true }),
    timestamp: ProtoField(5, ScalarType.UINT32, { optional: true }),
    random: ProtoField(6, ScalarType.UINT32, { optional: true }),
    messages: ProtoField(7, () => PushMsgBody.fields, { repeated: true }),
});

/** 拉取私聊最新消息序列号请求。 */
export const SsoGetPeerSeq = ProtoMessage.of({
    peerUid: ProtoField(1, ScalarType.STRING),
});

/** 拉取私聊最新消息序列号响应（seq1/seq2 取较大值）。 */
export const SsoGetPeerSeqResponse = ProtoMessage.of({
    seq1: ProtoField(3, ScalarType.UINT64, { optional: true }),
    seq2: ProtoField(4, ScalarType.UINT64, { optional: true }),
    latestMsgTime: ProtoField(5, ScalarType.UINT32, { optional: true }),
});
