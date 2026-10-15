import { DianaError, ErrorCode } from '../common/errors.js';
import { FileUploadExt } from '../packet/highway.js';
import {
    broadcastGroupFile,
    groupFileDelete,
    groupFileDeleteResponse,
    groupFileDownload,
    groupFileDownloadResponse,
    groupFileMove,
    groupFileMoveResponse,
    groupFileRename,
    groupFileRenameResponse,
    groupFileUpload,
    groupFileUploadResponse,
} from '../packet/oidb/index.js';
import type { HighwayService } from './highway.js';
import type { MediaMetadata } from './media.js';
import type { OidbService } from './oidb.js';
import { randomInt } from '../util/random.js';

const APP_ID = 7;
const BUS_ID = 102;
const UPLOAD_COMMAND = 71;

/** 群文件上传结果。 */
export interface GroupFileUploadResult {
    fileId: string;
    fileKey: Buffer;
    checkKey: Buffer;
    uploadIp: string;
    uploadPort: number;
}

/** 群文件服务。 */
export class GroupFileService {
    constructor(
        private readonly oidb: OidbService,
        private readonly highway: HighwayService,
    ) {}

    /** 上传群文件。 */
    async upload(
        groupUin: number,
        targetDirectory: string,
        fileName: string,
        data: Buffer,
        meta: MediaMetadata,
    ): Promise<GroupFileUploadResult> {
        const response = await this.oidb.call(groupFileUpload, groupFileUploadResponse, {
            upload: {
                groupUin,
                appId: APP_ID,
                busId: BUS_ID,
                entrance: 6,
                targetDirectory,
                fileName,
                localDirectory: `/${fileName}`,
                fileSize: BigInt(meta.size),
                fileSha1: meta.sha1,
                fileSha3: Buffer.alloc(0),
                fileMd5: meta.md5,
                field15: true,
            },
        });
        const upload = response.upload;
        if (!upload) {
            throw new DianaError(ErrorCode.Protocol, '群文件上传响应缺少必要字段');
        }
        const ext = FileUploadExt.encode({
            unknown1: 100,
            unknown2: 1,
            entry: {
                busiBuff: { busId: BUS_ID, senderUin: 0, receiverUin: 0, groupCode: 0 },
                fileEntry: {
                    fileSize: BigInt(meta.size),
                    md5: meta.md5,
                    checkKey: upload.checkKey,
                    md5S2: meta.md5,
                    fileId: upload.fileId,
                    uploadKey: upload.fileKey,
                },
                clientInfo: { clientType: 3, appId: '100', terminalType: 3, clientVer: '1.1.1', unknown: 4 },
                fileNameInfo: { fileName },
                host: { hosts: [{ url: { unknown: 1, host: upload.uploadIp }, port: upload.uploadPort }] },
            },
        });
        await this.highway.upload(UPLOAD_COMMAND, data, meta.md5, ext);
        // 广播群文件：消息由服务端下发，不走 PbSendMsg
        await this.oidb.send(broadcastGroupFile, {
            broadcast: {
                groupUin: BigInt(groupUin),
                type: 2,
                info: {
                    busiType: BUS_ID,
                    fileId: upload.fileId,
                    field3: randomInt(0, 0x7fffffff),
                    field4: '',
                    field5: true,
                },
            },
        });
        return {
            fileId: upload.fileId,
            fileKey: upload.fileKey,
            checkKey: upload.checkKey,
            uploadIp: upload.uploadIp,
            uploadPort: upload.uploadPort,
        };
    }

    /** 获取群文件下载 URL。 */
    async getDownloadUrl(groupUin: number, fileId: string): Promise<string> {
        const response = await this.oidb.call(groupFileDownload, groupFileDownloadResponse, {
            download: { groupUin, appId: APP_ID, busId: BUS_ID, fileId },
        });
        const download = response.download;
        if (!download) {
            throw new DianaError(ErrorCode.Protocol, '群文件下载响应缺少必要字段');
        }
        return `https://${download.downloadDns}/ftn_handler/${download.downloadUrl.toString('hex')}/?fname=`;
    }

    /** 删除群文件。 */
    async delete(groupUin: number, fileId: string): Promise<void> {
        await this.oidb.call(groupFileDelete, groupFileDeleteResponse, {
            delete: { groupUin, busId: BUS_ID, fileId },
        });
    }

    /** 重命名群文件。 */
    async rename(groupUin: number, fileId: string, parentDirectory: string, newFileName: string): Promise<void> {
        await this.oidb.call(groupFileRename, groupFileRenameResponse, {
            rename: { groupUin, busId: BUS_ID, fileId, parentDirectory, newFileName },
        });
    }

    /** 移动群文件。 */
    async move(groupUin: number, fileId: string, parentDirectory: string, targetDirectory: string): Promise<void> {
        await this.oidb.call(groupFileMove, groupFileMoveResponse, {
            move: { groupUin, appId: APP_ID, busId: BUS_ID, fileId, parentDirectory, targetDirectory },
        });
    }
}