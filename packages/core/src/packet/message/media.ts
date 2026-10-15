import { ProtoField, ProtoMessage, ScalarType } from '../../pb/index.js';

/** 图片格式。 */
export enum PicFormat {
    UNKNOWN = 0,
    PNG = 1001,
    JPEG = 1000,
    GIF = 2000,
    WEBP = 1002,
    BMP = 1005,
    TIFF = 1006,
}

/** 文件信息。 */
export const FileInfo = ProtoMessage.of({
    fileSize: ProtoField(1, ScalarType.UINT32),
    fileHash: ProtoField(2, ScalarType.STRING, { optional: true }),
    fileSha1: ProtoField(3, ScalarType.STRING, { optional: true }),
    fileName: ProtoField(4, ScalarType.STRING, { optional: true }),
    type: ProtoField(
        5,
        () => ({
            type: ProtoField(1, ScalarType.UINT32),
            picFormat: ProtoField(2, ScalarType.UINT32),
            videoFormat: ProtoField(3, ScalarType.UINT32),
            voiceFormat: ProtoField(4, ScalarType.UINT32),
        }),
        { optional: true },
    ),
    width: ProtoField(6, ScalarType.UINT32),
    height: ProtoField(7, ScalarType.UINT32),
    time: ProtoField(8, ScalarType.UINT32),
    original: ProtoField(9, ScalarType.UINT32),
});

/** 媒体索引节点。 */
export const IndexNode = ProtoMessage.of({
    info: ProtoField(1, () => FileInfo.fields, { optional: true }),
    fileUuid: ProtoField(2, ScalarType.STRING, { optional: true }),
    storeId: ProtoField(3, ScalarType.UINT32),
    uploadTime: ProtoField(4, ScalarType.UINT32),
    ttl: ProtoField(5, ScalarType.UINT32),
    subType: ProtoField(6, ScalarType.UINT32),
    appId: ProtoField(7, ScalarType.UINT32, { optional: true }),
});

/** 图片业务扩展信息。 */
export const PicExtBizInfo = ProtoMessage.of({
    bizType: ProtoField(1, ScalarType.UINT32),
    textSummary: ProtoField(2, ScalarType.STRING, { optional: true }),
    bytesPbReserveC2C: ProtoField(11, ScalarType.BYTES, { optional: true }),
    bytesPbReserveTroop: ProtoField(12, ScalarType.BYTES, { optional: true }),
});

/** 视频业务扩展信息。 */
export const VideoExtBizInfo = ProtoMessage.of({
    fromScene: ProtoField(1, ScalarType.UINT32),
    toScene: ProtoField(2, ScalarType.UINT32),
    bytesPbReserve: ProtoField(3, ScalarType.BYTES, { optional: true }),
});

/** 语音业务扩展信息。 */
export const PttExtBizInfo = ProtoMessage.of({
    srcUin: ProtoField(1, ScalarType.UINT64),
    pttScene: ProtoField(2, ScalarType.UINT32),
    pttType: ProtoField(3, ScalarType.UINT32),
    changeVoice: ProtoField(4, ScalarType.UINT32),
    waveform: ProtoField(5, ScalarType.BYTES, { optional: true }),
    autoConvertText: ProtoField(6, ScalarType.UINT32),
    bytesReserve: ProtoField(11, ScalarType.BYTES, { optional: true }),
    bytesPbReserve: ProtoField(12, ScalarType.BYTES, { optional: true }),
    bytesGeneralFlags: ProtoField(13, ScalarType.BYTES, { optional: true }),
});

/** 业务扩展信息。 */
export const ExtBizInfo = ProtoMessage.of({
    pic: ProtoField(1, () => PicExtBizInfo.fields, { optional: true }),
    video: ProtoField(2, () => VideoExtBizInfo.fields, { optional: true }),
    ptt: ProtoField(3, () => PttExtBizInfo.fields, { optional: true }),
    busiType: ProtoField(10, ScalarType.UINT32),
});

/** 图片下载 URL 参数。 */
export const PicUrlExtInfo = ProtoMessage.of({
    originalParameter: ProtoField(1, ScalarType.STRING, { optional: true }),
    bigParameter: ProtoField(2, ScalarType.STRING, { optional: true }),
    thumbParameter: ProtoField(3, ScalarType.STRING, { optional: true }),
});

/** 图片信息。 */
export const PictureInfo = ProtoMessage.of({
    urlPath: ProtoField(1, ScalarType.STRING, { optional: true }),
    ext: ProtoField(2, () => PicUrlExtInfo.fields, { optional: true }),
    domain: ProtoField(3, ScalarType.STRING, { optional: true }),
});

/** 视频信息。 */
export const VideoInfo = ProtoMessage.of({});

/** 音频信息。 */
export const AudioInfo = ProtoMessage.of({});

/** 哈希摘要（上传来源信息，高速通道扩展需原样回传）。 */
export const HashSum = ProtoMessage.of({
    c2c: ProtoField(
        201,
        () => ({
            friendUid: ProtoField(2, ScalarType.STRING, { optional: true }),
        }),
        { optional: true },
    ),
    troop: ProtoField(
        202,
        () => ({
            groupUin: ProtoField(1, ScalarType.UINT32, { optional: true }),
        }),
        { optional: true },
    ),
});

/** 媒体信息体。 */
export const MsgInfoBody = ProtoMessage.of({
    index: ProtoField(1, () => IndexNode.fields),
    picture: ProtoField(2, () => PictureInfo.fields, { optional: true }),
    video: ProtoField(3, () => VideoInfo.fields, { optional: true }),
    audio: ProtoField(4, () => AudioInfo.fields, { optional: true }),
    fileExist: ProtoField(5, ScalarType.BOOL),
    hashSum: ProtoField(6, () => HashSum.fields, { optional: true }),
});

/** NT 富媒体信息。 */
export const MsgInfo = ProtoMessage.of({
    msgInfoBody: ProtoField(1, () => MsgInfoBody.fields, { repeated: true }),
    extBizInfo: ProtoField(2, () => ExtBizInfo.fields, { optional: true }),
});