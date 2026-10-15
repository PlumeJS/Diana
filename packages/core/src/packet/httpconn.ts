import { ProtoField, ProtoMessage, ScalarType } from '../pb/index.js';

/** 拉取高速上传服务器地址的请求。 */
export const FetchHighwayUrl = ProtoMessage.of({
    body: ProtoField(0x501, () => ({
        field1: ProtoField(1, ScalarType.INT32),
        field2: ProtoField(2, ScalarType.INT32),
        field3: ProtoField(3, ScalarType.INT32),
        field4: ProtoField(4, ScalarType.INT32),
        /** 登录票据（A2），缺省时服务器签发的 sigSession 与会话无绑定，上传的文件无法被下载。 */
        loginSigTicket: ProtoField(5, ScalarType.BYTES, { optional: true }),
        field6: ProtoField(6, ScalarType.INT32),
        serviceTypes: ProtoField(7, ScalarType.INT32, { repeated: true, packed: true }),
        field9: ProtoField(9, ScalarType.INT32),
        field10: ProtoField(10, ScalarType.INT32),
        field11: ProtoField(11, ScalarType.INT32),
        ver: ProtoField(15, ScalarType.STRING),
    })),
});

/** 拉取高速上传服务器地址的响应。 */
export const FetchHighwayUrlResponse = ProtoMessage.of({
    body: ProtoField(0x501, () => ({
        sigSession: ProtoField(1, ScalarType.BYTES),
        sessionKey: ProtoField(2, ScalarType.BYTES),
        serverInfos: ProtoField(
            3,
            () => ({
                serviceType: ProtoField(1, ScalarType.UINT32),
                serverAddrs: ProtoField(
                    2,
                    () => ({
                        type: ProtoField(1, ScalarType.UINT32),
                        ip: ProtoField(2, ScalarType.FIXED32),
                        port: ProtoField(3, ScalarType.UINT32),
                        area: ProtoField(4, ScalarType.UINT32),
                    }),
                    { repeated: true },
                ),
            }),
            { repeated: true },
        ),
    })),
});