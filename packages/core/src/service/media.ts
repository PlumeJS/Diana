import { DianaError, ErrorCode } from '../common/errors.js';
import { createLogger } from '../common/logger.js';
import { md5, Sha1Stream, sha1 } from '../crypto/digest.js';
import { NTV2RichMediaHighwayExt } from '../packet/highway.js';
import {
    downloadGroupImage,
    downloadGroupImageResponse,
    downloadGroupRecord,
    downloadGroupRecordResponse,
    downloadGroupVideo,
    downloadGroupVideoResponse,
    downloadPrivateImage,
    downloadPrivateImageResponse,
    downloadPrivateRecord,
    downloadPrivateRecordResponse,
    downloadPrivateVideo,
    downloadPrivateVideoResponse,
    uploadGroupImage,
    uploadGroupImageResponse,
    uploadGroupRecord,
    uploadGroupRecordResponse,
    uploadGroupVideo,
    uploadGroupVideoResponse,
    uploadPrivateImage,
    uploadPrivateImageResponse,
    uploadPrivateRecord,
    uploadPrivateRecordResponse,
    uploadPrivateVideo,
    uploadPrivateVideoResponse,
} from '../packet/media/index.js';
import type { DownloadResp, UploadResp } from '../packet/media/index.js';
import { FlashTransferUploadReq, FlashTransferUploadResp } from '../packet/media/index.js';
import { MsgInfo } from '../packet/message/index.js';
import type { IndexNode, PicFormat } from '../packet/message/index.js';
import type { InferProtoModel, InferProtoModelInput } from '../pb/index.js';
import { int32IpToString } from '../util/format.js';
import { ImageSubType } from './message.js';
import type { HighwayService } from './highway.js';
import type { OidbService } from './oidb.js';

const MAX_BLOCK_SIZE = 1024 * 1024;
const PRIVATE_IMAGE_UPLOAD_COMMAND = 1003;
const GROUP_IMAGE_UPLOAD_COMMAND = 1004;
/** 语音高速通道命令：私聊 1007、群聊 1008（对齐 acidify HighwayContext）。 */
const PRIVATE_RECORD_UPLOAD_COMMAND = 1007;
const GROUP_RECORD_UPLOAD_COMMAND = 1008;
/** 视频封面高速通道命令：私聊 1002、群聊 1006（对齐 acidify HighwayContext）。 */
const PRIVATE_VIDEO_THUMB_COMMAND = 1002;
const GROUP_VIDEO_THUMB_COMMAND = 1006;
/** 视频封面的子文件类型。 */
const VIDEO_SUB_FILE_TYPE = 100;
/** 语音保留字段（对齐 acidify buildPrivateRecordExtBizInfo）。 */
const PRIVATE_RECORD_RESERVE = Buffer.from([0x08, 0x00, 0x38, 0x00]);
const PRIVATE_RECORD_GENERAL_FLAGS = Buffer.from([
    0x9a, 0x01, 0x0b, 0xaa, 0x03, 0x08, 0x08, 0x04, 0x12, 0x04, 0x00, 0x00, 0x00, 0x00,
]);
/** 语音保留字段（对齐 acidify buildGroupRecordExtBizInfo：群场景放 bytesPbReserve）。 */
const GROUP_RECORD_RESERVE = Buffer.from([0x08, 0x00, 0x38, 0x00]);
const GROUP_RECORD_GENERAL_FLAGS = Buffer.from([0x9a, 0x01, 0x07, 0xaa, 0x03, 0x04, 0x08, 0x08, 0x12, 0x00]);
/** 视频保留字段（对齐 acidify buildVideoExtBizInfo）。 */
const VIDEO_PB_RESERVE = Buffer.from([0x80, 0x01, 0x00]);
/** 闪传分块大小（1MB，与 acidify FlashTransferContext 一致）。 */
const FLASH_TRANSFER_CHUNK_SIZE = 1024 * 1024;
/** 闪传 appId：私聊 1413、群聊 1415（对齐 acidify）。 */
const FLASH_TRANSFER_APP_ID_PRIVATE = 1413;
const FLASH_TRANSFER_APP_ID_GROUP = 1415;
/** QQ 闪传切片上传地址。 */
const FLASH_TRANSFER_URL = 'https://multimedia.qfile.qq.com/sliceupload';

/** 媒体通用元数据。 */
export interface MediaMetadata {
    size: number;
    md5: Buffer;
    sha1: Buffer;
}

/** 图片元数据。 */
export interface ImageMetadata extends MediaMetadata {
    width: number;
    height: number;
    ext: string;
    format: PicFormat;
}

/** 视频封面。 */
export interface VideoThumbnail {
    data: Buffer;
    image: ImageMetadata;
}

/** 视频元数据（宽高与时长，用于播放器显示进度）。 */
export interface VideoMeta {
    width: number;
    height: number;
    /** 时长，单位秒（对齐 acidify FileInfo.time）。 */
    duration: number;
}

/** 上传结果。 */
export interface UploadedMedia {
    /** 服务端返回的 NT 富媒体信息原始字节，直接作为 `common.pbElement` 发送。 */
    msgInfo: Buffer;
    /** 兼容旧版元素（`CompatQMsg`）原始字节：群聊为 CustomFace，私聊为 NotOnlineImage。 */
    compat?: Buffer;
}

/** 计算媒体通用元数据。 */
export function computeMediaMetadata(data: Buffer): MediaMetadata {
    return { size: data.length, md5: md5(data), sha1: sha1(data) };
}

/** 计算 PbReserve 扩展字节（对齐 acidify PicExtBizInfo.PbReserve：非空 subType 恒编码，普通图片=0，动画表情=1）。 */
function buildPicReserve(subType: ImageSubType): Buffer {
    return Buffer.from([0x08, subType]);
}

/**
 * 取流式 SHA1 当前累积态的中间副本（非末块用）。
 * acidify SHA1Stream.hash(digest, bigEndian=false)：原始未 padding 中间态按 32 位字小端序输出。
 * 注意不能用 Node crypto 的 digest()：它会做 padding，得到的是「当前数据+padding」的完整哈希而非原始中间态。
 */
function sha1StateIntermediate(stream: Sha1Stream): Buffer {
    return stream.hashLittleEndian();
}

/** 媒体上传下载服务。 */
export class MediaService {
    private readonly log = createLogger('MediaService');

    constructor(
        private readonly oidb: OidbService,
        private readonly highway: HighwayService,
        private readonly selfUid: string | undefined,
    ) {}

    /** 上传群图片，返回上传结果 {@link UploadedMedia}。 */
    async uploadGroupImage(
        groupUin: number,
        data: Buffer,
        image: ImageMetadata,
        subType: ImageSubType = ImageSubType.Picture,
        summary?: string,
    ): Promise<UploadedMedia> {
        const response = await this.oidb.call(uploadGroupImage, uploadGroupImageResponse, {
            reqHead: {
                common: { requestId: 1, command: 100 },
                scene: { requestType: 2, businessType: 1, sceneType: 2, groupExt: { groupUin } },
                client: { agentType: 2 },
            },
            upload: this.buildUpload(data, image, subType, summary, 2),
        });
        return this.finishUpload(response.upload, GROUP_IMAGE_UPLOAD_COMMAND, data, image);
    }

    /** 上传私聊图片，返回上传结果 {@link UploadedMedia}。 */
    async uploadPrivateImage(
        uid: string,
        data: Buffer,
        image: ImageMetadata,
        subType: ImageSubType = ImageSubType.Picture,
        summary?: string,
    ): Promise<UploadedMedia> {
        const response = await this.oidb.call(uploadPrivateImage, uploadPrivateImageResponse, {
            reqHead: {
                common: { requestId: 1, command: 100 },
                // c2c 场景 uid 填自己的 uid（对齐 acidify buildBaseUploadReq：targetUid = client.uid）
                scene: { requestType: 2, businessType: 1, sceneType: 1, c2cExt: { accountType: 2, uid: this.selfUid } },
                client: { agentType: 2 },
            },
            upload: this.buildUpload(data, image, subType, summary, 1),
        });
        return this.finishUpload(response.upload, PRIVATE_IMAGE_UPLOAD_COMMAND, data, image);
    }

    /** 获取群图片下载 URL。 */
    async getGroupImageDownloadUrl(node: InferProtoModelInput<typeof IndexNode.fields>): Promise<string> {
        const response = await this.oidb.call(downloadGroupImage, downloadGroupImageResponse, {
            reqHead: {
                common: { requestId: 1, command: 200 },
                scene: { requestType: 2, businessType: 1, sceneType: 2, groupExt: {} },
                client: { agentType: 2 },
            },
            download: { node },
        });
        return this.resolveDownloadUrl(response.download);
    }

    /** 上传群语音，返回上传结果 {@link UploadedMedia}。 */
    async uploadGroupRecord(
        groupUin: number,
        data: Buffer,
        meta: MediaMetadata,
        duration: number,
    ): Promise<UploadedMedia> {
        const response = await this.oidb.call(uploadGroupRecord, uploadGroupRecordResponse, {
            reqHead: {
                common: { requestId: 1, command: 100 },
                scene: { requestType: 2, businessType: 3, sceneType: 2, groupExt: { groupUin } },
                client: { agentType: 2 },
            },
            upload: this.buildRecordUpload(meta, duration, 2),
        });
        return this.finishUpload(response.upload, GROUP_RECORD_UPLOAD_COMMAND, data, meta);
    }

    /** 上传私聊语音，返回上传结果 {@link UploadedMedia}。 */
    async uploadPrivateRecord(
        uid: string,
        data: Buffer,
        meta: MediaMetadata,
        duration: number,
    ): Promise<UploadedMedia> {
        const response = await this.oidb.call(uploadPrivateRecord, uploadPrivateRecordResponse, {
            reqHead: {
                common: { requestId: 4, command: 100 },
                // c2c 场景 uid 填自己的 uid（对齐 acidify buildBaseUploadReq：targetUid = client.uid）
                scene: { requestType: 2, businessType: 3, sceneType: 1, c2cExt: { accountType: 2, uid: this.selfUid } },
                client: { agentType: 2 },
            },
            upload: this.buildRecordUpload(meta, duration, 1),
        });
        return this.finishUpload(response.upload, PRIVATE_RECORD_UPLOAD_COMMAND, data, meta);
    }

    /** 上传群视频，返回上传结果 {@link UploadedMedia}。视频主文件走闪传，封面走高速通道。 */
    async uploadGroupVideo(
        groupUin: number,
        data: Buffer,
        meta: MediaMetadata,
        thumbnail: VideoThumbnail,
        videoMeta: VideoMeta,
    ): Promise<UploadedMedia> {
        const response = await this.oidb.call(uploadGroupVideo, uploadGroupVideoResponse, {
            reqHead: {
                common: { requestId: 3, command: 100 },
                scene: { requestType: 2, businessType: 2, sceneType: 2, groupExt: { groupUin } },
                client: { agentType: 2 },
            },
            upload: this.buildVideoUpload(meta, thumbnail, 2, videoMeta),
        });
        return this.finishVideoUpload(
            response.upload,
            GROUP_VIDEO_THUMB_COMMAND,
            data,
            meta,
            thumbnail,
            FLASH_TRANSFER_APP_ID_GROUP,
        );
    }

    /** 上传私聊视频，返回上传结果 {@link UploadedMedia}。视频主文件走闪传，封面走高速通道。 */
    async uploadPrivateVideo(
        uid: string,
        data: Buffer,
        meta: MediaMetadata,
        thumbnail: VideoThumbnail,
        videoMeta: VideoMeta,
    ): Promise<UploadedMedia> {
        const response = await this.oidb.call(uploadPrivateVideo, uploadPrivateVideoResponse, {
            reqHead: {
                common: { requestId: 3, command: 100 },
                // c2c 场景 uid 填自己的 uid（对齐 acidify buildBaseUploadReq：targetUid = client.uid）
                scene: { requestType: 2, businessType: 2, sceneType: 1, c2cExt: { accountType: 2, uid: this.selfUid } },
                client: { agentType: 2 },
            },
            upload: this.buildVideoUpload(meta, thumbnail, 1, videoMeta),
        });
        return this.finishVideoUpload(
            response.upload,
            PRIVATE_VIDEO_THUMB_COMMAND,
            data,
            meta,
            thumbnail,
            FLASH_TRANSFER_APP_ID_PRIVATE,
        );
    }

    /** 获取群语音下载 URL。 */
    async getGroupRecordDownloadUrl(node: InferProtoModelInput<typeof IndexNode.fields>): Promise<string> {
        const response = await this.oidb.call(downloadGroupRecord, downloadGroupRecordResponse, {
            reqHead: {
                common: { requestId: 1, command: 200 },
                scene: { requestType: 1, businessType: 3, sceneType: 2, groupExt: {} },
                client: { agentType: 2 },
            },
            download: { node },
        });
        return this.resolveDownloadUrl(response.download);
    }

    /** 获取私聊语音下载 URL。 */
    async getPrivateRecordDownloadUrl(
        uid: string,
        node: InferProtoModelInput<typeof IndexNode.fields>,
    ): Promise<string> {
        const response = await this.oidb.call(downloadPrivateRecord, downloadPrivateRecordResponse, {
            reqHead: {
                common: { requestId: 1, command: 200 },
                scene: { requestType: 1, businessType: 3, sceneType: 1, c2cExt: { accountType: 2, uid } },
                client: { agentType: 2 },
            },
            download: { node },
        });
        return this.resolveDownloadUrl(response.download);
    }

    /** 获取群视频下载 URL。 */
    async getGroupVideoDownloadUrl(node: InferProtoModelInput<typeof IndexNode.fields>): Promise<string> {
        const response = await this.oidb.call(downloadGroupVideo, downloadGroupVideoResponse, {
            reqHead: {
                common: { requestId: 1, command: 200 },
                scene: { requestType: 2, businessType: 2, sceneType: 2, groupExt: {} },
                client: { agentType: 2 },
            },
            download: { node },
        });
        return this.resolveDownloadUrl(response.download);
    }

    /** 获取私聊视频下载 URL。 */
    async getPrivateVideoDownloadUrl(
        uid: string,
        node: InferProtoModelInput<typeof IndexNode.fields>,
    ): Promise<string> {
        const response = await this.oidb.call(downloadPrivateVideo, downloadPrivateVideoResponse, {
            reqHead: {
                common: { requestId: 1, command: 200 },
                scene: { requestType: 2, businessType: 2, sceneType: 1, c2cExt: { accountType: 2, uid } },
                client: { agentType: 2 },
            },
            download: { node },
        });
        return this.resolveDownloadUrl(response.download);
    }

    /** 获取私聊图片下载 URL。 */
    async getPrivateImageDownloadUrl(
        uid: string,
        node: InferProtoModelInput<typeof IndexNode.fields>,
    ): Promise<string> {
        const response = await this.oidb.call(downloadPrivateImage, downloadPrivateImageResponse, {
            reqHead: {
                common: { requestId: 1, command: 200 },
                scene: { requestType: 2, businessType: 1, sceneType: 1, c2cExt: { accountType: 2, uid } },
                client: { agentType: 2 },
            },
            download: { node },
        });
        return this.resolveDownloadUrl(response.download);
    }

    private buildUpload(
        data: Buffer,
        image: ImageMetadata,
        subType: ImageSubType,
        summary: string | undefined,
        sceneType: number,
    ) {
        const md5Hex = image.md5.toString('hex');
        const reserve = buildPicReserve(subType);
        return {
            uploadInfo: [
                {
                    fileInfo: {
                        fileSize: image.size,
                        fileHash: md5Hex,
                        fileSha1: image.sha1.toString('hex'),
                        fileName: `${md5Hex.toUpperCase()}.${image.ext}`,
                        type: { type: 1, picFormat: image.format },
                        width: image.width,
                        height: image.height,
                        original: 1,
                    },
                    subFileType: 0,
                },
            ],
            tryFastUploadCompleted: true,
            srvSendMsg: false,
            clientRandomId: BigInt(Date.now()),
            compatQMsgSceneType: sceneType,
            clientSeq: 10,
            extBizInfo: {
                pic: {
                    bizType: subType,
                    // 对齐 acidify：C2C 场景只填 bytesPbReserveC2C，群场景只填 bytesPbReserveTroop
                    bytesPbReserveC2C: sceneType === 1 ? reserve : undefined,
                    bytesPbReserveTroop: sceneType === 2 ? reserve : undefined,
                    textSummary: summary ?? (subType === ImageSubType.Picture ? '[图片]' : '[动画表情]'),
                },
            },
            noNeedCompatMsg: false,
        };
    }

    private buildRecordUpload(meta: MediaMetadata, duration: number, sceneType: number) {
        const md5Hex = meta.md5.toString('hex');
        const isGroup = sceneType === 2;
        return {
            uploadInfo: [
                {
                    fileInfo: {
                        fileSize: meta.size,
                        fileHash: md5Hex,
                        fileSha1: meta.sha1.toString('hex'),
                        fileName: `${md5Hex}.amr`,
                        type: { type: 3, voiceFormat: 1 },
                        time: duration,
                        original: 0,
                    },
                    subFileType: 0,
                },
            ],
            tryFastUploadCompleted: true,
            srvSendMsg: false,
            clientRandomId: BigInt(Date.now()),
            compatQMsgSceneType: sceneType,
            clientSeq: 10,
            extBizInfo: {
                // 空的 pic/video/ptt 子对象也要编码，对齐 acidify buildRecordExtBizInfo
                pic: { textSummary: '' },
                video: { bytesPbReserve: Buffer.alloc(0) },
                ptt: {
                    bytesReserve: isGroup ? Buffer.alloc(0) : PRIVATE_RECORD_RESERVE,
                    bytesPbReserve: isGroup ? GROUP_RECORD_RESERVE : Buffer.alloc(0),
                    bytesGeneralFlags: isGroup ? GROUP_RECORD_GENERAL_FLAGS : PRIVATE_RECORD_GENERAL_FLAGS,
                },
            },
            noNeedCompatMsg: false,
        };
    }

    private buildVideoUpload(
        meta: MediaMetadata,
        thumbnail: VideoThumbnail,
        sceneType: number,
        videoMeta: VideoMeta,
    ) {
        const md5Hex = meta.md5.toString('hex');
        const thumbMd5Hex = thumbnail.image.md5.toString('hex').toUpperCase();
        return {
            uploadInfo: [
                {
                    fileInfo: {
                        fileSize: meta.size,
                        fileHash: md5Hex,
                        fileSha1: meta.sha1.toString('hex'),
                        // 对齐 acidify：固定 video.mp4
                        fileName: 'video.mp4',
                        type: { type: 2 },
                        width: videoMeta.width,
                        height: videoMeta.height,
                        time: videoMeta.duration,
                        original: 0,
                    },
                    subFileType: 0,
                },
                {
                    fileInfo: {
                        fileSize: thumbnail.image.size,
                        fileHash: thumbMd5Hex,
                        fileSha1: thumbnail.image.sha1.toString('hex'),
                        // 对齐 acidify：固定 video.<ext>
                        fileName: `video.${thumbnail.image.ext}`,
                        type: { type: 1, picFormat: thumbnail.image.format },
                        width: videoMeta.width,
                        height: videoMeta.height,
                        original: 0,
                    },
                    subFileType: VIDEO_SUB_FILE_TYPE,
                },
            ],
            tryFastUploadCompleted: true,
            srvSendMsg: false,
            clientRandomId: BigInt(Date.now()),
            compatQMsgSceneType: sceneType,
            clientSeq: 10,
            extBizInfo: {
                pic: { bizType: 0, textSummary: '' },
                video: { bytesPbReserve: VIDEO_PB_RESERVE },
                ptt: {
                    bytesReserve: Buffer.alloc(0),
                    bytesPbReserve: Buffer.alloc(0),
                    bytesGeneralFlags: Buffer.alloc(0),
                },
            },
            noNeedCompatMsg: false,
        };
    }

    private async finishUpload(
        upload: InferProtoModel<typeof UploadResp.fields> | undefined,
        commandId: number,
        data: Buffer,
        meta: MediaMetadata,
    ): Promise<UploadedMedia> {
        const rawMsgInfo = upload?.msgInfo;
        if (!upload || !rawMsgInfo) {
            throw new DianaError(ErrorCode.Protocol, '上传响应缺少必要字段');
        }
        const compat = upload.compatQMsg;
        const uKey = upload.uKey;
        // 服务器已存在同名文件时会直接快速返回（不带 uKey），此时无需再走高速通道上传；
        // 否则重新上传会产生一个已过期的临时文件，重复发送同一媒体时被服务器判定为“图片已过期”。
        if (!uKey) {
            return { msgInfo: rawMsgInfo, compat };
        }
        await this.highway.upload(commandId, data, meta.md5, this.buildExt(rawMsgInfo, uKey, upload.ipv4s, meta.sha1));
        return { msgInfo: rawMsgInfo, compat };
    }

    private async finishVideoUpload(
        upload: InferProtoModel<typeof UploadResp.fields> | undefined,
        thumbCommandId: number,
        data: Buffer,
        meta: MediaMetadata,
        thumbnail: VideoThumbnail,
        appId: number,
    ): Promise<UploadedMedia> {
        const rawMsgInfo = upload?.msgInfo;
        if (!upload || !rawMsgInfo) {
            throw new DianaError(ErrorCode.Protocol, '上传响应缺少必要字段');
        }
        const compat = upload.compatQMsg;
        if (upload.uKey) {
            // 对齐 acidify：视频主文件走闪传（sliceupload），而非高速通道
            this.log.info(`视频闪传开始: appId=${appId} size=${data.length} chunks=${Math.ceil(data.length / FLASH_TRANSFER_CHUNK_SIZE)}`);
            const success = await this.flashTransferUpload(upload.uKey, appId, data);
            if (!success) {
                throw new DianaError(ErrorCode.Protocol, '视频文件闪传上传失败');
            }
        } else {
            this.log.info('视频 uKey 为空，服务器已有该文件，跳过闪传');
        }
        // 封面走独立的高速通道子文件（对齐 acidify uploadVideoThumbnail）
        const sub = upload.subFileInfos[0];
        if (sub?.uKey) {
            const ext = this.buildExt(rawMsgInfo, sub.uKey, sub.ipv4s, thumbnail.image.sha1);
            await this.highway.upload(thumbCommandId, thumbnail.data, thumbnail.image.md5, ext);
        }
        return { msgInfo: rawMsgInfo, compat };
    }

    /**
     * 闪传切片上传（对齐 acidify FlashTransferContext）：
     * 预扫描分块 SHA1（流式累积态），再逐块 POST 到 sliceupload。
     */
    private async flashTransferUpload(uKey: string, appId: number, data: Buffer): Promise<boolean> {
        const chunkCount = Math.ceil(data.length / FLASH_TRANSFER_CHUNK_SIZE);
        // 预扫描：计算每个分块边界的流式 SHA1 状态（sha1StateV）
        const sha1StateList: Buffer[] = [];
        const scanHash = new Sha1Stream();
        for (let i = 0; i < chunkCount; i++) {
            const start = i * FLASH_TRANSFER_CHUNK_SIZE;
            const chunk = data.subarray(start, Math.min(start + FLASH_TRANSFER_CHUNK_SIZE, data.length));
            scanHash.update(chunk);
            // 非末块取原始累积中间态（小端序，对齐 SHA1Stream.hash(digest, false)），末块取最终 digest
            sha1StateList.push(i === chunkCount - 1 ? scanHash.final() : sha1StateIntermediate(scanHash));
        }

        for (let i = 0; i < chunkCount; i++) {
            const start = i * FLASH_TRANSFER_CHUNK_SIZE;
            const chunk = data.subarray(start, Math.min(start + FLASH_TRANSFER_CHUNK_SIZE, data.length));
            const req = FlashTransferUploadReq.encode({
                field1: 0,
                appId,
                field3: 2,
                body: {
                    field1: Buffer.alloc(0),
                    uKey,
                    start,
                    end: start + chunk.length - 1,
                    sha1: sha1(chunk),
                    sha1StateV: { state: sha1StateList },
                    body: chunk,
                },
            });
            try {
                const response = await fetch(FLASH_TRANSFER_URL, {
                    method: 'POST',
                    headers: {
                        Accept: '*/*',
                        // 对齐 acidify：Expect 100-continue
                        Expect: '100-continue',
                        Connection: 'keep-alive',
                        'Accept-Encoding': 'gzip',
                    },
                    body: new Uint8Array(req),
                });
                if (!response.ok) {
                    this.log.error(`闪传上传块 ${start} 失败: HTTP ${response.status}`);
                    return false;
                }
                const resp = FlashTransferUploadResp.decode(Buffer.from(await response.arrayBuffer()));
                if (resp.status !== 'success') {
                    this.log.error(`闪传上传块 ${start} 失败: ${resp.status}`);
                    return false;
                }
            } catch (error) {
                this.log.error('闪传上传块异常', error);
                return false;
            }
        }
        return true;
    }

    /** 构建高速通道扩展信息（`MsgInfo` 原样回传，仅解出所需字段）。 */
    private buildExt(
        rawMsgInfo: Buffer,
        uKey: string,
        ipv4s: InferProtoModel<typeof UploadResp.fields>['ipv4s'],
        fallbackSha1: Buffer,
    ): Buffer {
        const msgInfo = MsgInfo.decode(rawMsgInfo);
        const index = msgInfo.msgInfoBody[0]?.index;
        const fileSha1 = index?.info?.fileSha1 ? Buffer.from(index.info.fileSha1, 'hex') : fallbackSha1;
        return NTV2RichMediaHighwayExt.encode({
            fileUuid: index?.fileUuid,
            uKey,
            network: {
                ipv4s: ipv4s.map((ip) => ({
                    domain: { isEnable: true, ip: int32IpToString(ip.outIP) },
                    port: ip.outPort,
                })),
            },
            msgInfoBody: msgInfo.msgInfoBody,
            blockSize: MAX_BLOCK_SIZE,
            hash: { fileSha1: [fileSha1] },
        });
    }

    private resolveDownloadUrl(download: InferProtoModel<typeof DownloadResp.fields> | undefined): string {
        const info = download?.info;
        if (!download || !info) {
            throw new DianaError(ErrorCode.Protocol, '下载响应缺少必要字段');
        }
        return `https://${info.domain}${info.urlPath}${download.rKeyParam}`;
    }
}