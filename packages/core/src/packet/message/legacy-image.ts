import { ProtoField, ProtoMessage, ScalarType } from '../../pb/index.js';

/** 旧版（非在线）图片元素。 */
export const NotOnlineImageElement = ProtoMessage.of({
    filePath: ProtoField(1, ScalarType.STRING, { optional: true }),
    fileLen: ProtoField(2, ScalarType.UINT32),
    downloadPath: ProtoField(3, ScalarType.STRING, { optional: true }),
    oldVerSendFile: ProtoField(4, ScalarType.BYTES, { optional: true }),
    imgType: ProtoField(5, ScalarType.INT32),
    previewsImage: ProtoField(6, ScalarType.BYTES, { optional: true }),
    picMd5: ProtoField(7, ScalarType.BYTES, { optional: true }),
    picHeight: ProtoField(8, ScalarType.UINT32),
    picWidth: ProtoField(9, ScalarType.UINT32),
    resId: ProtoField(10, ScalarType.STRING, { optional: true }),
    flag: ProtoField(11, ScalarType.BYTES, { optional: true }),
    thumbUrl: ProtoField(12, ScalarType.STRING, { optional: true }),
    original: ProtoField(13, ScalarType.INT32),
    bigUrl: ProtoField(14, ScalarType.STRING, { optional: true }),
    origUrl: ProtoField(15, ScalarType.STRING, { optional: true }),
    bizType: ProtoField(16, ScalarType.INT32),
    pbRes: ProtoField(
        29,
        () => ({
            subType: ProtoField(1, ScalarType.INT32),
            summary: ProtoField(8, ScalarType.STRING, { optional: true }),
            url: ProtoField(30, ScalarType.STRING, { optional: true }),
            md5Str: ProtoField(31, ScalarType.STRING, { optional: true }),
        }),
        { optional: true },
    ),
});

/** 自定义（动画）表情元素。 */
export const CustomFaceElement = ProtoMessage.of({
    guid: ProtoField(1, ScalarType.BYTES, { optional: true }),
    filePath: ProtoField(2, ScalarType.STRING, { optional: true }),
    shortcut: ProtoField(3, ScalarType.STRING, { optional: true }),
    buffer: ProtoField(4, ScalarType.BYTES, { optional: true }),
    flag: ProtoField(5, ScalarType.BYTES, { optional: true }),
    oldData: ProtoField(6, ScalarType.BYTES, { optional: true }),
    fileId: ProtoField(7, ScalarType.UINT32),
    fileType: ProtoField(10, ScalarType.INT32),
    md5: ProtoField(13, ScalarType.BYTES, { optional: true }),
    thumbUrl: ProtoField(14, ScalarType.STRING, { optional: true }),
    bigUrl: ProtoField(15, ScalarType.STRING, { optional: true }),
    origUrl: ProtoField(16, ScalarType.STRING, { optional: true }),
    bizType: ProtoField(17, ScalarType.INT32),
    index: ProtoField(21, ScalarType.INT32),
    width: ProtoField(22, ScalarType.INT32),
    height: ProtoField(23, ScalarType.INT32),
    size: ProtoField(25, ScalarType.UINT32),
    origin: ProtoField(26, ScalarType.INT32),
    pbReserve: ProtoField(
        34,
        () => ({
            subType: ProtoField(1, ScalarType.INT32),
            summary: ProtoField(9, ScalarType.STRING, { optional: true }),
        }),
        { optional: true },
    ),
});