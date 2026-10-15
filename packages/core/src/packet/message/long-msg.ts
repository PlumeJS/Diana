import { ProtoField, ProtoMessage, ScalarType } from '../../pb/index.js';
import { ContentHead } from './content-head.js';
import { MessageBody } from './message-body.js';

/** 合并转发节点中的路由头。 */
export const CommonRoutingHead = ProtoMessage.of({
    fromUin: ProtoField(1, ScalarType.INT64, { optional: true }),
    fromUid: ProtoField(2, ScalarType.STRING, { optional: true }),
    fromAppId: ProtoField(3, ScalarType.INT32, { optional: true }),
    fromInstId: ProtoField(4, ScalarType.INT32, { optional: true }),
    toUin: ProtoField(5, ScalarType.INT64, { optional: true }),
    toUid: ProtoField(6, ScalarType.STRING, { optional: true }),
    c2cExt: ProtoField(
        7,
        () => ({
            c2cType: ProtoField(1, ScalarType.INT32, { optional: true }),
            serviceType: ProtoField(2, ScalarType.INT32, { optional: true }),
            sig: ProtoField(3, ScalarType.BYTES, { optional: true }),
            fromTinyId: ProtoField(4, ScalarType.INT64, { optional: true }),
            toTinyId: ProtoField(5, ScalarType.INT64, { optional: true }),
            name: ProtoField(6, ScalarType.STRING, { optional: true }),
        }),
        { optional: true },
    ),
    groupExt: ProtoField(
        8,
        () => ({
            groupCode: ProtoField(1, ScalarType.INT64, { optional: true }),
            groupType: ProtoField(2, ScalarType.INT32, { optional: true }),
            groupInfoSeq: ProtoField(3, ScalarType.INT64, { optional: true }),
            groupCard: ProtoField(4, ScalarType.STRING, { optional: true }),
            groupCardType: ProtoField(5, ScalarType.INT32, { optional: true }),
            groupLevel: ProtoField(6, ScalarType.INT32, { optional: true }),
            groupName: ProtoField(7, ScalarType.STRING, { optional: true }),
            extGroupKeyInfo: ProtoField(8, ScalarType.STRING, { optional: true }),
            msgFlag: ProtoField(9, ScalarType.INT32, { optional: true }),
        }),
        { optional: true },
    ),
});

/** 合并转发中的单条消息。 */
export const CommonMessage = ProtoMessage.of({
    routingHead: ProtoField(1, () => CommonRoutingHead.fields, { optional: true }),
    contentHead: ProtoField(2, () => ContentHead.fields, { optional: true }),
    body: ProtoField(3, () => MessageBody.fields, { optional: true }),
});

/** 合并转发内容。 */
export const PbMultiMsgNew = ProtoMessage.of({
    msg: ProtoField(1, () => CommonMessage.fields, { repeated: true }),
});

/** 合并转发条目。 */
export const PbMultiMsgItem = ProtoMessage.of({
    fileName: ProtoField(1, ScalarType.STRING, { optional: true }),
    buffer: ProtoField(2, () => PbMultiMsgNew.fields, { optional: true }),
});

/** 合并转发传输体。 */
export const PbMultiMsgTransmit = ProtoMessage.of({
    messages: ProtoField(1, () => CommonMessage.fields, { repeated: true }),
    items: ProtoField(2, () => PbMultiMsgItem.fields, { repeated: true }),
});

/** 长消息对端信息。 */
export const LongMsgPeerInfo = ProtoMessage.of({
    peerUid: ProtoField(2, ScalarType.STRING, { optional: true }),
});

/** 长消息拉取请求体。 */
export const LongMsgRecvReq = ProtoMessage.of({
    peerInfo: ProtoField(1, () => LongMsgPeerInfo.fields, { optional: true }),
    resId: ProtoField(2, ScalarType.STRING),
    msgType: ProtoField(3, ScalarType.UINT32),
});

/** 长消息拉取响应体。 */
export const LongMsgRecvRsp = ProtoMessage.of({
    resId: ProtoField(3, ScalarType.STRING, { optional: true }),
    payload: ProtoField(4, ScalarType.BYTES, { optional: true }),
});

/** 长消息发送请求体。 */
export const LongMsgSendReq = ProtoMessage.of({
    msgType: ProtoField(1, ScalarType.UINT32),
    peerInfo: ProtoField(2, () => LongMsgPeerInfo.fields, { optional: true }),
    groupUin: ProtoField(3, ScalarType.INT64),
    payload: ProtoField(4, ScalarType.BYTES, { optional: true }),
});

/** 长消息属性。 */
export const LongMsgAttr = ProtoMessage.of({
    subCmd: ProtoField(1, ScalarType.UINT32),
    clientType: ProtoField(2, ScalarType.UINT32),
    platform: ProtoField(3, ScalarType.UINT32),
    proxyType: ProtoField(4, ScalarType.UINT32),
});

/** 长消息接口请求。 */
export const LongMsgInterfaceReq = ProtoMessage.of({
    recvReq: ProtoField(1, () => LongMsgRecvReq.fields, { optional: true }),
    sendReq: ProtoField(2, () => LongMsgSendReq.fields, { optional: true }),
    attr: ProtoField(15, () => LongMsgAttr.fields, { optional: true }),
});

/** 长消息发送响应体。 */
export const LongMsgSendRsp = ProtoMessage.of({
    resId: ProtoField(3, ScalarType.STRING, { optional: true }),
});

/** 长消息接口响应。 */
export const LongMsgInterfaceRsp = ProtoMessage.of({
    recvRsp: ProtoField(1, () => LongMsgRecvRsp.fields, { optional: true }),
    sendRsp: ProtoField(2, () => LongMsgSendRsp.fields, { optional: true }),
    attr: ProtoField(15, () => LongMsgAttr.fields, { optional: true }),
});
