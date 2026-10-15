import { ProtoField, ProtoMessage, ScalarType } from '../../pb/index.js';

/** 引用/回复的源消息元素。 */
export const SrcMsgElement = ProtoMessage.of({
    origSeqs: ProtoField(1, ScalarType.UINT32, { repeated: true, packed: true }),
    senderUin: ProtoField(2, ScalarType.UINT32),
    time: ProtoField(3, ScalarType.INT32, { optional: true }),
    flag: ProtoField(4, ScalarType.INT32, { optional: true }),
    elems: ProtoField(5, ScalarType.BYTES, { repeated: true }),
    type: ProtoField(6, ScalarType.INT32, { optional: true }),
    pbReserve: ProtoField(
        8,
        () => ({
            oriMsgType: ProtoField(1, ScalarType.UINT32, { optional: true }),
            messageId: ProtoField(2, ScalarType.UINT64, { optional: true }),
            senderUid: ProtoField(3, ScalarType.STRING, { optional: true }),
            friendSequence: ProtoField(8, ScalarType.UINT32, { optional: true }),
        }),
        { optional: true },
    ),
    toUin: ProtoField(10, ScalarType.UINT32, { optional: true }),
});