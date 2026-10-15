import { ProtoField, ProtoMessage } from '../pb/index.js';
import { ScalarType } from '../pb/index.js';

/** SSO 包头的预留字段（protobuf）。 */
export const SsoReserveFields = ProtoMessage.of({
    clientIpCookie: ProtoField(4, ScalarType.BYTES, { optional: true }),
    flag: ProtoField(9, ScalarType.UINT32, { optional: true }),
    envId: ProtoField(10, ScalarType.UINT32, { optional: true }),
    localeId: ProtoField(11, ScalarType.UINT32, { optional: true }),
    qimei: ProtoField(12, ScalarType.STRING, { optional: true }),
    env: ProtoField(13, ScalarType.BYTES, { optional: true }),
    newconnFlag: ProtoField(14, ScalarType.UINT32, { optional: true }),
    traceParent: ProtoField(15, ScalarType.STRING, { optional: true }),
    uid: ProtoField(16, ScalarType.STRING, { optional: true }),
    imsi: ProtoField(18, ScalarType.UINT32, { optional: true }),
    networkType: ProtoField(19, ScalarType.UINT32, { optional: true }),
    ipStackType: ProtoField(20, ScalarType.UINT32, { optional: true }),
    msgType: ProtoField(21, ScalarType.UINT32, { optional: true }),
    trpcRsp: ProtoField(22, ScalarType.STRING, { optional: true }),
    transInfo: ProtoField(23, ScalarType.BYTES, { optional: true }),
    secureInfo: ProtoField(
        24,
        () => ({
            sign: ProtoField(1, ScalarType.BYTES, { optional: true }),
            token: ProtoField(2, ScalarType.BYTES, { optional: true }),
            extra: ProtoField(3, ScalarType.BYTES, { optional: true }),
        }),
        { optional: true },
    ),
    secSigFlag: ProtoField(25, ScalarType.UINT32, { optional: true }),
    ntCoreVersion: ProtoField(26, ScalarType.UINT32, { optional: true }),
    ssoRouteCost: ProtoField(27, ScalarType.UINT32, { optional: true }),
    ssoIpOrigin: ProtoField(28, ScalarType.UINT32, { optional: true }),
    presureToken: ProtoField(30, ScalarType.BYTES, { optional: true }),
});
