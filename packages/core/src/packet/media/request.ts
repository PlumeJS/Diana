import { ExtBizInfo, FileInfo, IndexNode } from '../message/index.js';
import { ProtoField, ProtoMessage, ScalarType } from '../../pb/index.js';

/** NT 富媒体公共头。 */
export const MediaCommonHead = ProtoMessage.of({
    requestId: ProtoField(1, ScalarType.UINT32),
    command: ProtoField(2, ScalarType.UINT32),
});

/** NT 富媒体请求头。 */
export const MultiMediaReqHead = ProtoMessage.of({
    common: ProtoField(1, () => MediaCommonHead.fields, { optional: true }),
    scene: ProtoField(
        2,
        () => ({
            requestType: ProtoField(101, ScalarType.UINT32),
            businessType: ProtoField(102, ScalarType.UINT32),
            sceneType: ProtoField(200, ScalarType.UINT32),
            c2cExt: ProtoField(
                201,
                () => ({
                    accountType: ProtoField(1, ScalarType.UINT32),
                    uid: ProtoField(2, ScalarType.STRING, { optional: true }),
                }),
                { optional: true },
            ),
            groupExt: ProtoField(202, () => ({ groupUin: ProtoField(1, ScalarType.UINT32) }), { optional: true }),
        }),
        { optional: true },
    ),
    client: ProtoField(3, () => ({ agentType: ProtoField(1, ScalarType.UINT32) }), { optional: true }),
});

/** NT 富媒体上传请求。 */
export const UploadReq = ProtoMessage.of({
    uploadInfo: ProtoField(
        1,
        () => ({
            fileInfo: ProtoField(1, () => FileInfo.fields, { optional: true }),
            subFileType: ProtoField(2, ScalarType.UINT32),
        }),
        { repeated: true },
    ),
    tryFastUploadCompleted: ProtoField(2, ScalarType.BOOL),
    srvSendMsg: ProtoField(3, ScalarType.BOOL),
    clientRandomId: ProtoField(4, ScalarType.UINT64),
    compatQMsgSceneType: ProtoField(5, ScalarType.UINT32),
    extBizInfo: ProtoField(6, () => ExtBizInfo.fields, { optional: true }),
    clientSeq: ProtoField(7, ScalarType.UINT32),
    noNeedCompatMsg: ProtoField(8, ScalarType.BOOL),
});

/** NT 富媒体下载请求。 */
export const DownloadReq = ProtoMessage.of({
    node: ProtoField(1, () => IndexNode.fields, { optional: true }),
    download: ProtoField(
        2,
        () => ({
            pic: ProtoField(1, () => ({})),
            video: ProtoField(
                2,
                () => ({
                    busiType: ProtoField(1, ScalarType.UINT32),
                    sceneType: ProtoField(2, ScalarType.UINT32),
                    subBusiType: ProtoField(3, ScalarType.UINT32),
                }),
                { optional: true },
            ),
            ptt: ProtoField(3, () => ({})),
        }),
        { optional: true },
    ),
});

/** 富媒体鉴权请求。 */
export const MsgInfoAuthReq = ProtoMessage.of({
    msg: ProtoField(1, ScalarType.BYTES, { optional: true }),
    authTime: ProtoField(2, ScalarType.UINT64),
});

/** NT 富媒体请求。 */
export const NTV2RichMediaRequest = ProtoMessage.of({
    reqHead: ProtoField(1, () => MultiMediaReqHead.fields, { optional: true }),
    upload: ProtoField(2, () => UploadReq.fields, { optional: true }),
    download: ProtoField(3, () => DownloadReq.fields, { optional: true }),
    msgInfoAuth: ProtoField(7, () => MsgInfoAuthReq.fields, { optional: true }),
    extension: ProtoField(99, ScalarType.BYTES, { optional: true }),
});