import { ProtoField, ProtoMessage, ScalarType } from '../../pb/index.js';
import { OidbSvcContract } from './contract.js';

/** 拉取群通知列表请求。 */
export const fetchGroupNotificationsContract = new OidbSvcContract(0x10c0, 1, {
    count: ProtoField(1, ScalarType.UINT64),
    startSequence: ProtoField(2, ScalarType.UINT64),
});

/** 拉取群通知列表响应。 */
export const fetchGroupNotificationsResponseContract = new OidbSvcContract(0x10c0, 1, {
    notifications: ProtoField(1, () => GroupNotificationEntry.fields, { repeated: true }),
});

/** 群通知条目。 */
export const GroupNotificationEntry = ProtoMessage.of({
    sequence: ProtoField(1, ScalarType.UINT64, { optional: true }),
    type: ProtoField(2, ScalarType.UINT64, { optional: true }),
    state: ProtoField(3, ScalarType.UINT64, { optional: true }),
    group: ProtoField(4, () => ({ groupUin: ProtoField(1, ScalarType.INT64, { optional: true }) }), { optional: true }),
    target: ProtoField(5, () => ({ uid: ProtoField(1, ScalarType.STRING, { optional: true }) }), { optional: true }),
    invitor: ProtoField(6, () => ({ uid: ProtoField(1, ScalarType.STRING, { optional: true }) }), { optional: true }),
    operator: ProtoField(7, () => ({ uid: ProtoField(1, ScalarType.STRING, { optional: true }) }), { optional: true }),
    comment: ProtoField(10, ScalarType.STRING, { optional: true }),
});
