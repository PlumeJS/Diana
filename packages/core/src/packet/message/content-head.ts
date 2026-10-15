import { ProtoField, ProtoMessage, ScalarType } from '../../pb/index.js';

/** 消息内容头。 */
export const ContentHead = ProtoMessage.of({
    type: ProtoField(1, ScalarType.UINT32),
    subType: ProtoField(2, ScalarType.UINT32, { optional: true }),
    c2cCmd: ProtoField(3, ScalarType.UINT32, { optional: true }),
    random: ProtoField(4, ScalarType.UINT32, { optional: true }),
    sequence: ProtoField(5, ScalarType.UINT32, { optional: true }),
    timestamp: ProtoField(6, ScalarType.UINT32),
    pkgNum: ProtoField(7, ScalarType.UINT32, { optional: true }),
    ntMsgSeq: ProtoField(11, ScalarType.UINT32, { optional: true }),
    msgUid: ProtoField(12, ScalarType.UINT64, { optional: true }),
});