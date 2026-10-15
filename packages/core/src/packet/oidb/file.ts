import { ProtoField, ProtoMessage, ScalarType } from '../../pb/index.js';
import { OidbSvcContract } from './contract.js';

/** 广播群文件请求（0x6d9_4）：高速上传完成后由服务端下发群文件消息，无需 PbSendMsg。 */
export const broadcastGroupFileRequest = ProtoMessage.of({
    broadcast: ProtoField(
        5,
        () => ({
            groupUin: ProtoField(1, ScalarType.UINT64),
            type: ProtoField(2, ScalarType.INT32),
            info: ProtoField(
                3,
                () => ({
                    busiType: ProtoField(1, ScalarType.INT32),
                    fileId: ProtoField(2, ScalarType.STRING),
                    field3: ProtoField(3, ScalarType.INT32),
                    field4: ProtoField(4, ScalarType.STRING),
                    field5: ProtoField(5, ScalarType.BOOL),
                }),
                { optional: true },
            ),
        }),
        { optional: true },
    ),
});

/** 广播群文件。 */
export const broadcastGroupFile = new OidbSvcContract(0x6d9, 4, broadcastGroupFileRequest.fields);
