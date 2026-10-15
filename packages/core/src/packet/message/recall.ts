import { ProtoField, ProtoMessage, ScalarType } from '../../pb/index.js';

/** 群消息撤回请求。 */
export const SsoGroupRecallMsg = ProtoMessage.of({
    type: ProtoField(1, ScalarType.UINT32),
    groupUin: ProtoField(2, ScalarType.UINT32),
    info: ProtoField(3, () => ({
        sequence: ProtoField(1, ScalarType.UINT32),
    })),
});

/** 私聊消息撤回请求。 */
export const SsoC2CRecallMsg = ProtoMessage.of({
    type: ProtoField(1, ScalarType.UINT32),
    targetUid: ProtoField(3, ScalarType.STRING),
    info: ProtoField(4, () => ({
        clientSequence: ProtoField(1, ScalarType.UINT32),
        random: ProtoField(2, ScalarType.UINT32),
        messageUid: ProtoField(3, ScalarType.UINT64),
        timestamp: ProtoField(4, ScalarType.UINT32),
        field5: ProtoField(5, ScalarType.UINT32),
        ntMsgSeq: ProtoField(6, ScalarType.UINT32),
    })),
    field5: ProtoField(5, () => ({
        field1: ProtoField(1, ScalarType.UINT32),
        field2: ProtoField(2, ScalarType.UINT32),
    })),
    field6: ProtoField(6, ScalarType.UINT32),
});
