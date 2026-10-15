import { ProtoField, ProtoMessage, ScalarType } from '../../pb/index.js';
import { OidbSvcContract } from './contract.js';

/** 私聊文件预上传请求（0xe37，子命令 1700）。 */
export const privateFileUploadRequest = ProtoMessage.of({
    subCommand: ProtoField(1, ScalarType.INT32),
    seq: ProtoField(2, ScalarType.INT32),
    upload: ProtoField(
        19,
        () => ({
            senderUid: ProtoField(10, ScalarType.STRING),
            receiverUid: ProtoField(20, ScalarType.STRING),
            fileSize: ProtoField(30, ScalarType.UINT64),
            fileName: ProtoField(40, ScalarType.STRING),
            md510M: ProtoField(50, ScalarType.BYTES),
            sha1: ProtoField(60, ScalarType.BYTES),
            localPath: ProtoField(70, ScalarType.STRING),
            md5: ProtoField(110, ScalarType.BYTES),
            triSha1: ProtoField(120, ScalarType.BYTES),
        }),
        { optional: true },
    ),
    field101: ProtoField(101, ScalarType.INT32),
    field102: ProtoField(102, ScalarType.INT32),
    field200: ProtoField(200, ScalarType.INT32),
    field99999: ProtoField(99999, ScalarType.BYTES),
});

/** 私聊文件预上传响应。 */
export const privateFileUploadResponse = ProtoMessage.of({
    upload: ProtoField(
        19,
        () => ({
            retCode: ProtoField(10, ScalarType.INT32),
            retMsg: ProtoField(20, ScalarType.STRING, { optional: true }),
            uploadIp: ProtoField(60, ScalarType.STRING),
            uploadPort: ProtoField(80, ScalarType.INT32),
            uuid: ProtoField(90, ScalarType.STRING),
            boolFileExist: ProtoField(110, ScalarType.BOOL),
            uploadIpList: ProtoField(130, ScalarType.STRING, { repeated: true }),
            fileIdCrc: ProtoField(200, ScalarType.STRING),
            uploadAddresses: ProtoField(
                210,
                () => ({
                    inIp: ProtoField(1, ScalarType.UINT32),
                    inPort: ProtoField(2, ScalarType.INT32),
                }),
                { repeated: true },
            ),
            mediaPlatformUploadKey: ProtoField(220, ScalarType.BYTES),
        }),
        { optional: true },
    ),
});

/** 私聊文件预上传。 */
export const privateFileUpload = new OidbSvcContract(0xe37, 1700, privateFileUploadRequest.fields);
export const privateFileUploadResponseContract = new OidbSvcContract(0xe37, 1700, privateFileUploadResponse.fields);
