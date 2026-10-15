import { ProtoField, ProtoMessage, ScalarType } from '../../pb/index.js';
import { IPv4, IPv6 } from './ip.js';
import { MediaCommonHead } from './request.js';

/** NT 富媒体响应头。 */
export const MultiMediaRespHead = ProtoMessage.of({
    common: ProtoField(1, () => MediaCommonHead.fields, { optional: true }),
    retCode: ProtoField(2, ScalarType.UINT32),
    message: ProtoField(3, ScalarType.STRING, { optional: true }),
});

/** 上传响应。 */
export const UploadResp = ProtoMessage.of({
    uKey: ProtoField(1, ScalarType.STRING, { optional: true }),
    uKeyTtlSecond: ProtoField(2, ScalarType.UINT32),
    ipv4s: ProtoField(3, () => IPv4.fields, { repeated: true }),
    ipv6s: ProtoField(4, () => IPv6.fields, { repeated: true }),
    msgSeq: ProtoField(5, ScalarType.UINT64),
    /** 服务端返回的 `MsgInfo` 原始字节，直接作为 `common.pbElement` 发送。 */
    msgInfo: ProtoField(6, ScalarType.BYTES, { optional: true }),
    compatQMsg: ProtoField(8, ScalarType.BYTES, { optional: true }),
    /** 子文件（如视频封面的高速通道信息）。 */
    subFileInfos: ProtoField(
        10,
        () => ({
            subType: ProtoField(1, ScalarType.UINT32),
            uKey: ProtoField(2, ScalarType.STRING, { optional: true }),
            uKeyTtlSecond: ProtoField(3, ScalarType.UINT32),
            ipv4s: ProtoField(4, () => IPv4.fields, { repeated: true }),
            ipv6s: ProtoField(5, () => IPv6.fields, { repeated: true }),
        }),
        { repeated: true },
    ),
});

/** 下载响应。 */
export const DownloadResp = ProtoMessage.of({
    rKeyParam: ProtoField(1, ScalarType.STRING, { optional: true }),
    rKeyTtlSecond: ProtoField(2, ScalarType.UINT32),
    info: ProtoField(
        3,
        () => ({
            domain: ProtoField(1, ScalarType.STRING, { optional: true }),
            urlPath: ProtoField(2, ScalarType.STRING, { optional: true }),
            httpsPort: ProtoField(3, ScalarType.UINT32),
            ipv4s: ProtoField(4, () => IPv4.fields, { repeated: true }),
            ipv6s: ProtoField(5, () => IPv6.fields, { repeated: true }),
        }),
        { optional: true },
    ),
    rKeyCreateTime: ProtoField(4, ScalarType.UINT32),
});

/** 富媒体鉴权响应。 */
export const MsgInfoAuthResp = ProtoMessage.of({
    authCode: ProtoField(1, ScalarType.UINT32),
    msg: ProtoField(2, ScalarType.BYTES, { optional: true }),
    resultTime: ProtoField(3, ScalarType.UINT64),
});

/** NT 富媒体响应。 */
export const NTV2RichMediaResponse = ProtoMessage.of({
    respHead: ProtoField(1, () => MultiMediaRespHead.fields, { optional: true }),
    upload: ProtoField(2, () => UploadResp.fields, { optional: true }),
    download: ProtoField(3, () => DownloadResp.fields, { optional: true }),
    msgInfoAuth: ProtoField(7, () => MsgInfoAuthResp.fields, { optional: true }),
    extension: ProtoField(99, ScalarType.BYTES, { optional: true }),
});