import { ProtoField, ProtoMessage, ScalarType } from '../pb/index.js';
import { MsgInfoBody } from './message/index.js';

/** 高速通道数据头。 */
export const DataHighwayHead = ProtoMessage.of({
    version: ProtoField(1, ScalarType.UINT32),
    uin: ProtoField(2, ScalarType.STRING, { optional: true }),
    command: ProtoField(3, ScalarType.STRING, { optional: true }),
    seq: ProtoField(4, ScalarType.UINT32, { optional: true }),
    retryTimes: ProtoField(5, ScalarType.UINT32, { optional: true }),
    appId: ProtoField(6, ScalarType.UINT32),
    dataFlag: ProtoField(7, ScalarType.UINT32),
    commandId: ProtoField(8, ScalarType.UINT32),
    buildVer: ProtoField(9, ScalarType.BYTES, { optional: true }),
});

/** 高速通道分段头。 */
export const SegHead = ProtoMessage.of({
    serviceId: ProtoField(1, ScalarType.UINT32, { optional: true }),
    filesize: ProtoField(2, ScalarType.UINT64),
    dataOffset: ProtoField(3, ScalarType.UINT64, { optional: true }),
    dataLength: ProtoField(4, ScalarType.UINT32),
    retCode: ProtoField(5, ScalarType.UINT32, { optional: true }),
    serviceTicket: ProtoField(6, ScalarType.BYTES),
    flag: ProtoField(7, ScalarType.UINT32, { optional: true }),
    md5: ProtoField(8, ScalarType.BYTES),
    fileMd5: ProtoField(9, ScalarType.BYTES),
    cacheAddr: ProtoField(10, ScalarType.UINT32, { optional: true }),
    queryTimes: ProtoField(11, ScalarType.UINT32),
    updateCacheIp: ProtoField(12, ScalarType.UINT32),
    cachePort: ProtoField(13, ScalarType.UINT32, { optional: true }),
});

/** 上传请求头。 */
export const ReqDataHighwayHead = ProtoMessage.of({
    msgBaseHead: ProtoField(1, () => DataHighwayHead.fields, { optional: true }),
    msgSegHead: ProtoField(2, () => SegHead.fields, { optional: true }),
    bytesReqExtendInfo: ProtoField(3, ScalarType.BYTES, { optional: true }),
    timestamp: ProtoField(4, ScalarType.UINT64),
    msgLoginSigHead: ProtoField(
        5,
        () => ({
            uint32LoginSigType: ProtoField(1, ScalarType.UINT32),
            bytesLoginSig: ProtoField(2, ScalarType.BYTES),
            appId: ProtoField(3, ScalarType.UINT32),
        }),
        { optional: true },
    ),
});

/** 上传响应头。 */
export const RespDataHighwayHead = ProtoMessage.of({
    msgBaseHead: ProtoField(1, () => DataHighwayHead.fields, { optional: true }),
    msgSegHead: ProtoField(2, () => SegHead.fields, { optional: true }),
    errorCode: ProtoField(3, ScalarType.UINT32),
    allowRetry: ProtoField(4, ScalarType.UINT32),
    cacheCost: ProtoField(5, ScalarType.UINT32),
    htCost: ProtoField(6, ScalarType.UINT32),
    bytesRspExtendInfo: ProtoField(7, ScalarType.BYTES, { optional: true }),
    timestamp: ProtoField(8, ScalarType.UINT64),
    range: ProtoField(9, ScalarType.UINT64),
    isReset: ProtoField(10, ScalarType.UINT32),
});

/** NT 富媒体高速通道扩展信息。 */
export const NTV2RichMediaHighwayExt = ProtoMessage.of({
    fileUuid: ProtoField(1, ScalarType.STRING),
    uKey: ProtoField(2, ScalarType.STRING),
    network: ProtoField(5, () => ({
        ipv4s: ProtoField(
            1,
            () => ({
                domain: ProtoField(1, () => ({
                    isEnable: ProtoField(1, ScalarType.BOOL),
                    ip: ProtoField(2, ScalarType.STRING),
                })),
                port: ProtoField(2, ScalarType.UINT32),
            }),
            { repeated: true },
        ),
    })),
    msgInfoBody: ProtoField(6, () => MsgInfoBody.fields, { repeated: true }),
    blockSize: ProtoField(10, ScalarType.UINT32),
    hash: ProtoField(11, () => ({
        fileSha1: ProtoField(1, ScalarType.BYTES, { repeated: true }),
    })),
});

/** 群文件上传扩展信息。 */
export const FileUploadExt = ProtoMessage.of({
    unknown1: ProtoField(1, ScalarType.INT32),
    unknown2: ProtoField(2, ScalarType.INT32),
    unknown3: ProtoField(3, ScalarType.INT32),
    entry: ProtoField(100, () => ({
        busiBuff: ProtoField(100, () => ({
            busId: ProtoField(1, ScalarType.INT32),
            senderUin: ProtoField(100, ScalarType.UINT32),
            receiverUin: ProtoField(200, ScalarType.UINT32),
            groupCode: ProtoField(400, ScalarType.UINT32),
        })),
        fileEntry: ProtoField(200, () => ({
            fileSize: ProtoField(100, ScalarType.UINT64),
            md5: ProtoField(200, ScalarType.BYTES),
            checkKey: ProtoField(300, ScalarType.BYTES),
            md5S2: ProtoField(400, ScalarType.BYTES),
            sha3: ProtoField(500, ScalarType.BYTES, { optional: true }),
            fileId: ProtoField(600, ScalarType.STRING),
            uploadKey: ProtoField(700, ScalarType.BYTES),
        })),
        clientInfo: ProtoField(300, () => ({
            clientType: ProtoField(100, ScalarType.INT32),
            appId: ProtoField(200, ScalarType.STRING),
            terminalType: ProtoField(300, ScalarType.INT32),
            clientVer: ProtoField(400, ScalarType.STRING),
            unknown: ProtoField(600, ScalarType.INT32),
        })),
        fileNameInfo: ProtoField(400, () => ({
            fileName: ProtoField(100, ScalarType.STRING),
        })),
        host: ProtoField(500, () => ({
            hosts: ProtoField(
                200,
                () => ({
                    url: ProtoField(1, () => ({
                        unknown: ProtoField(1, ScalarType.INT32),
                        host: ProtoField(2, ScalarType.STRING),
                    })),
                    port: ProtoField(2, ScalarType.UINT32),
                }),
                { repeated: true },
            ),
        })),
    })),
    unknown200: ProtoField(200, ScalarType.INT32),
});