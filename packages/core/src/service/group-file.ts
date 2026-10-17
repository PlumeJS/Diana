import { DianaError, ErrorCode } from '../common/errors.js';
import { FileUploadExt } from '../packet/highway.js';
import {
    broadcastGroupFile,
    groupFileCount,
    groupFileCountResponse,
    groupFileDelete,
    groupFileDeleteResponse,
    groupFileDownload,
    groupFileDownloadResponse,
    groupFileList,
    groupFileListResponse,
    groupFileMove,
    groupFileMoveResponse,
    groupFileRename,
    groupFileRenameResponse,
    groupFileSpace,
    groupFileSpaceResponse,
    groupFileUpload,
    groupFileUploadResponse,
    groupFolderCreate,
    groupFolderCreateResponse,
    groupFolderDelete,
    groupFolderDeleteResponse,
    groupFolderRename,
    groupFolderRenameResponse,
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

/** 群文件条目（0x6d8 列表视图）。 */
export interface GroupFileEntry {
    fileId: string;
    fileName: string;
    fileSize: number;
    uploadTime: number;
    deadTime: number;
    modifyTime: number;
    downloadTimes: number;
    uploaderUin: number;
    parentFolderId: string;
}

/** 群文件夹条目（0x6d8 列表视图）。 */
export interface GroupFolderEntry {
    folderId: string;
    parentFolderId: string;
    folderName: string;
    createTime: number;
    modifyTime: number;
    createUin: number;
    totalFileCount: number;
}

/** 群文件列表结果。 */
export interface GroupFileListResult {
    files: GroupFileEntry[];
    folders: GroupFolderEntry[];
    isEnd: boolean;
    nextIndex: number;
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

    /** 创建群文件夹，返回新文件夹 id。 */
    async createFolder(groupUin: number, name: string): Promise<string> {
        const response = await this.oidb.call(groupFolderCreate, groupFolderCreateResponse, {
            create: { groupUin, folderName: name, targetDirectory: '/' },
        });
        return response.create?.info?.folderId ?? '';
    }

    /** 删除群文件夹。 */
    async deleteFolder(groupUin: number, folderId: string): Promise<void> {
        await this.oidb.call(groupFolderDelete, groupFolderDeleteResponse, {
            delete: { groupUin, folderId },
        });
    }

    /** 重命名群文件夹。 */
    async renameFolder(groupUin: number, folderId: string, newFolderName: string): Promise<void> {
        await this.oidb.call(groupFolderRename, groupFolderRenameResponse, {
            rename: { groupUin, folderId, newFolderName },
        });
    }

    /** 拉取群文件列表（0x6d8 Service=1）。 */
    async listFiles(groupUin: number, folderId: string, startIndex = 0, fileCount = 60): Promise<GroupFileListResult> {
        const response = await this.oidb.call(groupFileList, groupFileListResponse, {
            list: {
                groupUin: BigInt(groupUin),
                appId: APP_ID,
                folderId,
                fileCount,
                sortBy: 1,
                startIndex,
                sortOrder: 2,
                showOnlinedocFolder: 0,
            },
        });
        const list = response.list;
        if (!list) {
            throw new DianaError(ErrorCode.Protocol, '群文件列表响应缺少必要字段');
        }
        const files: GroupFileEntry[] = [];
        const folders: GroupFolderEntry[] = [];
        for (const item of list.items) {
            if (item.type === 1 && item.file) {
                const file = item.file;
                files.push({
                    fileId: file.fileId,
                    fileName: file.fileName,
                    fileSize: Number(file.fileSize ?? 0),
                    uploadTime: file.uploadTime ?? 0,
                    deadTime: file.deadTime ?? 0,
                    modifyTime: file.modifyTime ?? 0,
                    downloadTimes: file.downloadTimes ?? 0,
                    uploaderUin: Number(file.uploaderUin ?? 0),
                    parentFolderId: file.parentFolderId ?? '',
                });
            } else if (item.type === 2 && item.folder) {
                const folder = item.folder;
                folders.push({
                    folderId: folder.folderId,
                    parentFolderId: folder.parentFolderId,
                    folderName: folder.folderName,
                    createTime: folder.createTime ?? 0,
                    modifyTime: folder.modifyTime ?? 0,
                    createUin: Number(folder.createUin ?? 0),
                    totalFileCount: folder.totalFileCount ?? 0,
                });
            }
        }
        return { files, folders, isEnd: list.isEnd ?? false, nextIndex: list.nextIndex ?? 0 };
    }

    /** 拉取群文件计数（0x6d8 Service=2）。 */
    async getFileCount(groupUin: number): Promise<{ allCount: number; limitCount: number; isFull: boolean }> {
        const response = await this.oidb.call(groupFileCount, groupFileCountResponse, {
            count: { groupUin: BigInt(groupUin), appId: APP_ID, busId: 6 },
        });
        const count = response.count;
        if (!count) {
            throw new DianaError(ErrorCode.Protocol, '群文件计数响应缺少必要字段');
        }
        return { allCount: count.allFileCount ?? 0, limitCount: count.limitCount ?? 0, isFull: count.isFull ?? false };
    }

    /** 拉取群文件空间信息（0x6d8 Service=3）。 */
    async getSpace(groupUin: number): Promise<{ totalSpace: number; usedSpace: number }> {
        const response = await this.oidb.call(groupFileSpace, groupFileSpaceResponse, {
            space: { groupUin: BigInt(groupUin), appId: APP_ID },
        });
        const space = response.space;
        if (!space) {
            throw new DianaError(ErrorCode.Protocol, '群文件空间响应缺少必要字段');
        }
        return { totalSpace: Number(space.totalSpace ?? 0), usedSpace: Number(space.usedSpace ?? 0) };
    }
}