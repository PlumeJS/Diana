import { ProtoField, ProtoMessage, ScalarType } from '../../pb/index.js';

/** IPv4 地址信息。 */
export const IPv4 = ProtoMessage.of({
    outIP: ProtoField(1, ScalarType.UINT32),
    outPort: ProtoField(2, ScalarType.UINT32),
    inIP: ProtoField(3, ScalarType.UINT32),
    inPort: ProtoField(4, ScalarType.UINT32),
    ipType: ProtoField(5, ScalarType.UINT32),
});

/** IPv6 地址信息。 */
export const IPv6 = ProtoMessage.of({
    outIP: ProtoField(1, ScalarType.BYTES, { optional: true }),
    outPort: ProtoField(2, ScalarType.UINT32),
    inIP: ProtoField(3, ScalarType.BYTES, { optional: true }),
    inPort: ProtoField(4, ScalarType.UINT32),
    ipType: ProtoField(5, ScalarType.UINT32),
});