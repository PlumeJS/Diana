import { ProtoField, ProtoMessage, ScalarType } from '../../pb/index.js';

/**
 * 私聊文件消息体（编码后放在 `MessageBody.msgContent`，即 field 2，而非富文本元素）。
 */
export const PrivateFileExtra = ProtoMessage.of({
    notOnlineFile: ProtoField(
        1,
        () => ({
            fileType: ProtoField(1, ScalarType.INT32, { optional: true }),
            sig: ProtoField(2, ScalarType.BYTES, { optional: true }),
            fileUuid: ProtoField(3, ScalarType.STRING),
            // 注意：此处填 md510M（前 10002432 字节 MD5），不是全文件 MD5
            fileMd5: ProtoField(4, ScalarType.BYTES),
            fileName: ProtoField(5, ScalarType.STRING),
            fileSize: ProtoField(6, ScalarType.INT64),
            note: ProtoField(7, ScalarType.BYTES, { optional: true }),
            subCmd: ProtoField(9, ScalarType.INT32, { optional: true }),
            dangerLevel: ProtoField(50, ScalarType.INT32, { optional: true }),
            lifeTime: ProtoField(51, ScalarType.INT32, { optional: true }),
            uploadTime: ProtoField(52, ScalarType.INT32, { optional: true }),
            absFileType: ProtoField(53, ScalarType.INT32, { optional: true }),
            clientType: ProtoField(54, ScalarType.INT32, { optional: true }),
            expireTime: ProtoField(55, ScalarType.INT64, { optional: true }),
            pbReserve: ProtoField(56, ScalarType.BYTES, { optional: true }),
            fileIdCrcMedia: ProtoField(57, ScalarType.STRING, { optional: true }),
        }),
        { optional: true },
    ),
});
