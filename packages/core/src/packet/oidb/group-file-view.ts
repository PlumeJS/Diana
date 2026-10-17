import { ProtoField, ScalarType } from '../../pb/index.js';
import { OidbSvcContract } from './contract.js';

/** 群文件视图（0x6d8_1，对齐 Lagrange GroupFSViewService；Service 字段区分功能 1=列表 2=计数 3=空间）。 */

/** 群文件条目（type 1=文件 2=文件夹）。 */
const itemBody = () => ({
    type: ProtoField(1, ScalarType.UINT32),
    folder: ProtoField(
        2,
        () => ({
            folderId: ProtoField(1, ScalarType.STRING),
            parentFolderId: ProtoField(2, ScalarType.STRING),
            folderName: ProtoField(3, ScalarType.STRING),
            createTime: ProtoField(4, ScalarType.UINT32, { optional: true }),
            modifyTime: ProtoField(5, ScalarType.UINT32, { optional: true }),
            createUin: ProtoField(6, ScalarType.UINT64, { optional: true }),
            creatorName: ProtoField(7, ScalarType.STRING, { optional: true }),
            totalFileCount: ProtoField(8, ScalarType.UINT32, { optional: true }),
            usedSpace: ProtoField(11, ScalarType.UINT64, { optional: true }),
        }),
        { optional: true },
    ),
    file: ProtoField(
        3,
        () => ({
            fileId: ProtoField(1, ScalarType.STRING),
            fileName: ProtoField(2, ScalarType.STRING),
            fileSize: ProtoField(3, ScalarType.UINT64, { optional: true }),
            uploadedSize: ProtoField(5, ScalarType.UINT64, { optional: true }),
            uploadTime: ProtoField(6, ScalarType.UINT32, { optional: true }),
            deadTime: ProtoField(7, ScalarType.UINT32, { optional: true }),
            modifyTime: ProtoField(8, ScalarType.UINT32, { optional: true }),
            downloadTimes: ProtoField(9, ScalarType.UINT32, { optional: true }),
            uploaderName: ProtoField(14, ScalarType.STRING, { optional: true }),
            uploaderUin: ProtoField(15, ScalarType.UINT64, { optional: true }),
            parentFolderId: ProtoField(16, ScalarType.STRING, { optional: true }),
        }),
        { optional: true },
    ),
});

/** 请求体：字段 2=列表 3=计数 4=空间。 */
const viewRequestBody = {
    list: ProtoField(
        2,
        () => ({
            groupUin: ProtoField(1, ScalarType.UINT64),
            appId: ProtoField(2, ScalarType.UINT32),
            folderId: ProtoField(3, ScalarType.STRING),
            fileCount: ProtoField(5, ScalarType.UINT32),
            sortBy: ProtoField(9, ScalarType.UINT32, { optional: true }),
            startIndex: ProtoField(13, ScalarType.UINT32, { optional: true }),
            sortOrder: ProtoField(17, ScalarType.UINT32, { optional: true }),
            showOnlinedocFolder: ProtoField(18, ScalarType.UINT32, { optional: true }),
        }),
        { optional: true },
    ),
    count: ProtoField(
        3,
        () => ({
            groupUin: ProtoField(1, ScalarType.UINT64),
            appId: ProtoField(2, ScalarType.UINT32),
            busId: ProtoField(3, ScalarType.UINT32),
        }),
        { optional: true },
    ),
    space: ProtoField(
        4,
        () => ({
            groupUin: ProtoField(1, ScalarType.UINT64),
            appId: ProtoField(2, ScalarType.UINT32),
        }),
        { optional: true },
    ),
};

/** 响应体：字段 2=列表 3=计数 4=空间。 */
const viewResponseBody = {
    list: ProtoField(
        2,
        () => ({
            retCode: ProtoField(1, ScalarType.INT32),
            retMsg: ProtoField(2, ScalarType.STRING, { optional: true }),
            isEnd: ProtoField(4, ScalarType.BOOL, { optional: true }),
            items: ProtoField(5, itemBody, { repeated: true }),
            nextIndex: ProtoField(13, ScalarType.UINT32, { optional: true }),
        }),
        { optional: true },
    ),
    count: ProtoField(
        3,
        () => ({
            retCode: ProtoField(1, ScalarType.INT32),
            retMsg: ProtoField(2, ScalarType.STRING, { optional: true }),
            allFileCount: ProtoField(4, ScalarType.UINT32, { optional: true }),
            limitCount: ProtoField(6, ScalarType.UINT32, { optional: true }),
            isFull: ProtoField(7, ScalarType.BOOL, { optional: true }),
        }),
        { optional: true },
    ),
    space: ProtoField(
        4,
        () => ({
            retCode: ProtoField(1, ScalarType.INT32),
            retMsg: ProtoField(2, ScalarType.STRING, { optional: true }),
            totalSpace: ProtoField(4, ScalarType.UINT64, { optional: true }),
            usedSpace: ProtoField(5, ScalarType.UINT64, { optional: true }),
        }),
        { optional: true },
    ),
};

/** 群文件列表（Oidb.Service=1）。 */
export const groupFileList = new OidbSvcContract(0x6d8, 1, viewRequestBody, true, 1);
export const groupFileListResponse = new OidbSvcContract(0x6d8, 1, viewResponseBody, true, 1);

/** 群文件计数（Oidb.Service=2）。 */
export const groupFileCount = new OidbSvcContract(0x6d8, 2, viewRequestBody, true, 2);
export const groupFileCountResponse = new OidbSvcContract(0x6d8, 2, viewResponseBody, true, 2);

/** 群文件空间（Oidb.Service=3）。 */
export const groupFileSpace = new OidbSvcContract(0x6d8, 3, viewRequestBody, true, 3);
export const groupFileSpaceResponse = new OidbSvcContract(0x6d8, 3, viewResponseBody, true, 3);
