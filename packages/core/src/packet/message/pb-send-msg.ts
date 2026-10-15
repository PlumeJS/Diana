import { ProtoField, ProtoMessage, ScalarType } from '../../pb/index.js';
import { ContentHead } from './content-head.js';
import { MessageBody } from './message-body.js';

/** 发送消息请求。 */
export const PbSendMsg = ProtoMessage.of({
    routingHead: ProtoField(
        1,
        () => ({
            c2cExt: ProtoField(
                1,
                () => ({
                    uin: ProtoField(1, ScalarType.UINT32, { optional: true }),
                    uid: ProtoField(2, ScalarType.STRING, { optional: true }),
                }),
                { optional: true },
            ),
            groupExt: ProtoField(
                2,
                () => ({ groupCode: ProtoField(1, ScalarType.UINT32, { optional: true }) }),
                { optional: true },
            ),
            groupTemp: ProtoField(
                3,
                () => ({
                    groupUin: ProtoField(1, ScalarType.UINT32, { optional: true }),
                    toUin: ProtoField(2, ScalarType.UINT32, { optional: true }),
                }),
                { optional: true },
            ),
            trans211: ProtoField(
                15,
                () => ({
                    toUin: ProtoField(1, ScalarType.UINT64, { optional: true }),
                    ccCmd: ProtoField(2, ScalarType.UINT32, { optional: true }),
                    uid: ProtoField(8, ScalarType.STRING, { optional: true }),
                }),
                { optional: true },
            ),
        }),
        { optional: true },
    ),
    contentHead: ProtoField(2, () => ContentHead.fields, { optional: true }),
    body: ProtoField(3, () => MessageBody.fields, { optional: true }),
    clientSequence: ProtoField(4, ScalarType.UINT32, { optional: true }),
    random: ProtoField(5, ScalarType.UINT32, { optional: true }),
    control: ProtoField(
        12,
        () => ({ msgFlag: ProtoField(1, ScalarType.INT32) }),
        { optional: true },
    ),
    multiSendSeq: ProtoField(14, ScalarType.UINT32),
});

/** 发送消息响应。 */
export const PbSendMsgResponse = ProtoMessage.of({
    resultCode: ProtoField(1, ScalarType.INT32),
    errMsg: ProtoField(2, ScalarType.STRING, { optional: true }),
    timestamp1: ProtoField(3, ScalarType.UINT32),
    groupSequence: ProtoField(11, ScalarType.UINT32, { optional: true }),
    privateSequence: ProtoField(14, ScalarType.UINT32),
});