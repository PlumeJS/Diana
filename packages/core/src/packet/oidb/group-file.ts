import { ProtoField, ProtoMessage, ScalarType } from '../../pb/index.js';
import { OidbSvcContract } from './contract.js';

/** 群文件请求。 */
export const groupFileRequest = ProtoMessage.of({
    upload: ProtoField(
        1,
        () => ({
            groupUin: ProtoField(1, ScalarType.UINT32),
            appId: ProtoField(2, ScalarType.UINT32),
            busId: ProtoField(3, ScalarType.UINT32),
            entrance: ProtoField(4, ScalarType.UINT32),
            targetDirectory: ProtoField(5, ScalarType.STRING),
            fileName: ProtoField(6, ScalarType.STRING),
            localDirectory: ProtoField(7, ScalarType.STRING),
            fileSize: ProtoField(8, ScalarType.INT64),
            fileSha1: ProtoField(9, ScalarType.BYTES),
            fileSha3: ProtoField(10, ScalarType.BYTES, { optional: true }),
            fileMd5: ProtoField(11, ScalarType.BYTES),
            field15: ProtoField(15, ScalarType.BOOL),
        }),
        { optional: true },
    ),
    download: ProtoField(
        3,
        () => ({
            groupUin: ProtoField(1, ScalarType.UINT32),
            appId: ProtoField(2, ScalarType.UINT32),
            busId: ProtoField(3, ScalarType.UINT32),
            fileId: ProtoField(4, ScalarType.STRING),
        }),
        { optional: true },
    ),
    delete: ProtoField(
        4,
        () => ({
            groupUin: ProtoField(1, ScalarType.UINT32),
            busId: ProtoField(3, ScalarType.UINT32),
            fileId: ProtoField(5, ScalarType.STRING),
        }),
        { optional: true },
    ),
    rename: ProtoField(
        5,
        () => ({
            groupUin: ProtoField(1, ScalarType.UINT32),
            busId: ProtoField(3, ScalarType.UINT32),
            fileId: ProtoField(4, ScalarType.STRING),
            parentDirectory: ProtoField(5, ScalarType.STRING),
            newFileName: ProtoField(6, ScalarType.STRING),
        }),
        { optional: true },
    ),
    move: ProtoField(
        6,
        () => ({
            groupUin: ProtoField(1, ScalarType.UINT32),
            appId: ProtoField(2, ScalarType.UINT32),
            busId: ProtoField(3, ScalarType.UINT32),
            fileId: ProtoField(4, ScalarType.STRING),
            parentDirectory: ProtoField(5, ScalarType.STRING),
            targetDirectory: ProtoField(6, ScalarType.STRING),
        }),
        { optional: true },
    ),
});

/** 群文件响应。 */
export const groupFileResponse = ProtoMessage.of({
    upload: ProtoField(
        1,
        () => ({
            retCode: ProtoField(1, ScalarType.INT32),
            retMsg: ProtoField(2, ScalarType.STRING, { optional: true }),
            boolFileExist: ProtoField(3, ScalarType.BOOL),
            fileId: ProtoField(4, ScalarType.STRING),
            fileKey: ProtoField(5, ScalarType.BYTES),
            checkKey: ProtoField(6, ScalarType.BYTES),
            uploadIp: ProtoField(7, ScalarType.STRING),
            uploadPort: ProtoField(8, ScalarType.UINT32),
        }),
        { optional: true },
    ),
    download: ProtoField(
        3,
        () => ({
            downloadDns: ProtoField(5, ScalarType.STRING),
            downloadUrl: ProtoField(6, ScalarType.BYTES),
        }),
        { optional: true },
    ),
    delete: ProtoField(
        4,
        () => ({
            retCode: ProtoField(1, ScalarType.INT32),
            clientWording: ProtoField(2, ScalarType.STRING, { optional: true }),
        }),
        { optional: true },
    ),
    rename: ProtoField(
        5,
        () => ({
            retCode: ProtoField(1, ScalarType.INT32),
            clientWording: ProtoField(2, ScalarType.STRING, { optional: true }),
        }),
        { optional: true },
    ),
    move: ProtoField(
        6,
        () => ({
            retCode: ProtoField(1, ScalarType.INT32),
            clientWording: ProtoField(2, ScalarType.STRING, { optional: true }),
        }),
        { optional: true },
    ),
});

/** 群文件上传。 */
export const groupFileUpload = new OidbSvcContract(0x6d6, 0, groupFileRequest.fields);
export const groupFileUploadResponse = new OidbSvcContract(0x6d6, 0, groupFileResponse.fields);

/** 群文件下载 URL。 */
export const groupFileDownload = new OidbSvcContract(0x6d6, 2, groupFileRequest.fields);
export const groupFileDownloadResponse = new OidbSvcContract(0x6d6, 2, groupFileResponse.fields);

/** 群文件删除。 */
export const groupFileDelete = new OidbSvcContract(0x6d6, 3, groupFileRequest.fields);
export const groupFileDeleteResponse = new OidbSvcContract(0x6d6, 3, groupFileResponse.fields);

/** 群文件重命名。 */
export const groupFileRename = new OidbSvcContract(0x6d6, 4, groupFileRequest.fields);
export const groupFileRenameResponse = new OidbSvcContract(0x6d6, 4, groupFileResponse.fields);

/** 群文件移动。 */
export const groupFileMove = new OidbSvcContract(0x6d6, 5, groupFileRequest.fields);
export const groupFileMoveResponse = new OidbSvcContract(0x6d6, 5, groupFileResponse.fields);