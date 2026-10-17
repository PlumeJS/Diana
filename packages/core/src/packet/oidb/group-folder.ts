import { ProtoField, ProtoMessage, ScalarType } from '../../pb/index.js';
import { OidbSvcContract } from './contract.js';

/** 群文件夹请求（0x6d7）。 */
export const groupFolderRequest = ProtoMessage.of({
    create: ProtoField(
        1,
        () => ({
            groupUin: ProtoField(1, ScalarType.UINT32),
            folderName: ProtoField(3, ScalarType.STRING),
            targetDirectory: ProtoField(4, ScalarType.STRING),
        }),
        { optional: true },
    ),
    delete: ProtoField(
        2,
        () => ({
            groupUin: ProtoField(1, ScalarType.UINT32),
            folderId: ProtoField(2, ScalarType.STRING),
        }),
        { optional: true },
    ),
    rename: ProtoField(
        3,
        () => ({
            groupUin: ProtoField(1, ScalarType.UINT32),
            folderId: ProtoField(2, ScalarType.STRING),
            newFolderName: ProtoField(5, ScalarType.STRING),
        }),
        { optional: true },
    ),
});

/** 群文件夹响应。 */
export const groupFolderResponse = ProtoMessage.of({
    create: ProtoField(
        1,
        () => ({
            retCode: ProtoField(1, ScalarType.INT32),
            retMsg: ProtoField(2, ScalarType.STRING, { optional: true }),
            info: ProtoField(
                3,
                () => ({
                    folderId: ProtoField(1, ScalarType.STRING),
                    folderName: ProtoField(2, ScalarType.STRING),
                    folderPath: ProtoField(4, ScalarType.STRING),
                }),
                { optional: true },
            ),
        }),
        { optional: true },
    ),
    delete: ProtoField(
        2,
        () => ({
            retCode: ProtoField(1, ScalarType.INT32),
            retMsg: ProtoField(2, ScalarType.STRING, { optional: true }),
        }),
        { optional: true },
    ),
    rename: ProtoField(
        3,
        () => ({
            retCode: ProtoField(1, ScalarType.INT32),
            retMsg: ProtoField(2, ScalarType.STRING, { optional: true }),
        }),
        { optional: true },
    ),
});

/** 创建群文件夹。 */
export const groupFolderCreate = new OidbSvcContract(0x6d7, 0, groupFolderRequest.fields);
export const groupFolderCreateResponse = new OidbSvcContract(0x6d7, 0, groupFolderResponse.fields);

/** 删除群文件夹。 */
export const groupFolderDelete = new OidbSvcContract(0x6d7, 1, groupFolderRequest.fields);
export const groupFolderDeleteResponse = new OidbSvcContract(0x6d7, 1, groupFolderResponse.fields);

/** 重命名群文件夹。 */
export const groupFolderRename = new OidbSvcContract(0x6d7, 2, groupFolderRequest.fields);
export const groupFolderRenameResponse = new OidbSvcContract(0x6d7, 2, groupFolderResponse.fields);
