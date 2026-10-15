import { ProtoField, ProtoMessage, ScalarType } from '../../pb/index.js';

/** OIDB 请求/响应的公共外层结构。 */
export const OidbBase = ProtoMessage.of({
    command: ProtoField(1, ScalarType.UINT32),
    subCommand: ProtoField(2, ScalarType.UINT32),
    errorCode: ProtoField(3, ScalarType.UINT32),
    body: ProtoField(4, ScalarType.BYTES, { optional: true }),
    errorMsg: ProtoField(5, ScalarType.STRING, { optional: true }),
    properties: ProtoField(
        11,
        () => ({
            key: ProtoField(1, ScalarType.STRING),
            value: ProtoField(2, ScalarType.BYTES),
        }),
        { repeated: true },
    ),
    reserved: ProtoField(12, ScalarType.INT32),
});