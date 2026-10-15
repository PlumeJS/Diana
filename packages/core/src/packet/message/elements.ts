import { ProtoField, ProtoMessage, ScalarType } from '../../pb/index.js';
import { CustomFaceElement, NotOnlineImageElement } from './legacy-image.js';
import { SrcMsgElement } from './src-msg.js';

/** 文本元素。 */
export const TextElement = ProtoMessage.of({
    str: ProtoField(1, ScalarType.STRING, { optional: true }),
    link: ProtoField(2, ScalarType.STRING, { optional: true }),
    attr6Buf: ProtoField(3, ScalarType.BYTES, { optional: true }),
    attr7Buf: ProtoField(4, ScalarType.BYTES, { optional: true }),
    buf: ProtoField(11, ScalarType.BYTES, { optional: true }),
    pbReserve: ProtoField(12, ScalarType.BYTES, { optional: true }),
});

/** @ 提及类型。 */
export enum MentionType {
    Someone = 2,
    All = 1,
}

/** @ 提及的附加信息。 */
export const MentionExtra = ProtoMessage.of({
    type: ProtoField(3, ScalarType.UINT32),
    uin: ProtoField(4, ScalarType.UINT32, { optional: true }),
    field5: ProtoField(5, ScalarType.UINT32, { optional: true }),
    uid: ProtoField(9, ScalarType.STRING),
});

/** 表情元素。 */
export const FaceElement = ProtoMessage.of({
    index: ProtoField(1, ScalarType.INT32, { optional: true }),
    old: ProtoField(2, ScalarType.BYTES, { optional: true }),
    buf: ProtoField(11, ScalarType.BYTES, { optional: true }),
});

/** 通用元素（承载头像表情、图片等业务数据）。 */
export const CommonElement = ProtoMessage.of({
    serviceType: ProtoField(1, ScalarType.INT32),
    pbElement: ProtoField(2, ScalarType.BYTES),
    businessType: ProtoField(3, ScalarType.UINT32),
});

/** LightApp（小程序 / JSON 卡片）元素。 */
export const LightAppElement = ProtoMessage.of({
    bytesData: ProtoField(1, ScalarType.BYTES),
    bytesMsgResid: ProtoField(2, ScalarType.BYTES, { optional: true }),
});

/** 消息元素。 */
export const MessageElement = ProtoMessage.of({
    text: ProtoField(1, () => TextElement.fields, { optional: true }),
    face: ProtoField(2, () => FaceElement.fields, { optional: true }),
    notOnlineImage: ProtoField(4, () => NotOnlineImageElement.fields, { optional: true }),
    customFace: ProtoField(8, () => CustomFaceElement.fields, { optional: true }),
    srcMsg: ProtoField(45, () => SrcMsgElement.fields, { optional: true }),
    lightApp: ProtoField(51, () => LightAppElement.fields, { optional: true }),
    common: ProtoField(53, () => CommonElement.fields, { optional: true }),
});