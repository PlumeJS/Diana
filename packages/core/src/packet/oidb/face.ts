import { ProtoField, ProtoMessage, ScalarType } from '../../pb/index.js';
import type { InferProtoModel } from '../../pb/index.js';
import { OidbSvcContract } from './contract.js';

/** 拉取表情信息请求。 */
export const fetchFaceDetailsContract = new OidbSvcContract(0x9154, 1, {
    field1: ProtoField(1, ScalarType.UINT32),
    field2: ProtoField(2, ScalarType.UINT32),
    field3: ProtoField(3, ScalarType.STRING),
});

/** 拉取表情信息响应。 */
export const fetchFaceDetailsResponseContract = new OidbSvcContract(0x9154, 1, {
    commonFace: ProtoField(2, () => FacesData.fields, { optional: true }),
    specialBigFace: ProtoField(3, () => FacesData.fields, { optional: true }),
    specialMagicFace: ProtoField(4, () => FacesData.fields, { optional: true }),
});

/** 一组表情包。 */
export const FacesData = ProtoMessage.of({
    facePackList: ProtoField(
        1,
        () => ({
            facePackName: ProtoField(1, ScalarType.STRING, { optional: true }),
            faces: ProtoField(2, () => FaceDetail.fields, { repeated: true }),
        }),
        { repeated: true },
    ),
    resourceUrl: ProtoField(2, () => FaceResourceUrl.fields, { optional: true }),
});

/** 表情详情。 */
export const FaceDetail = ProtoMessage.of({
    qSid: ProtoField(1, ScalarType.STRING),
    qDes: ProtoField(2, ScalarType.STRING, { optional: true }),
    emCode: ProtoField(3, ScalarType.STRING, { optional: true }),
    qCid: ProtoField(4, ScalarType.INT32, { optional: true }),
    aniStickerType: ProtoField(5, ScalarType.INT32, { optional: true }),
    aniStickerPackId: ProtoField(6, ScalarType.INT32, { optional: true }),
    aniStickerId: ProtoField(7, ScalarType.INT32, { optional: true }),
    url: ProtoField(8, () => FaceResourceUrl.fields, { optional: true }),
    faceNameAlias: ProtoField(9, ScalarType.STRING, { repeated: true }),
    unknown10: ProtoField(10, ScalarType.INT32, { optional: true }),
    aniStickerWidth: ProtoField(13, ScalarType.INT32, { optional: true }),
    aniStickerHeight: ProtoField(14, ScalarType.INT32, { optional: true }),
});

/** 表情资源地址。 */
export const FaceResourceUrl = ProtoMessage.of({
    baseUrl: ProtoField(1, ScalarType.STRING, { optional: true }),
    advUrl: ProtoField(2, ScalarType.STRING, { optional: true }),
});

/** 表情详情。 */
export type FaceInfo = InferProtoModel<typeof FaceDetail.fields>;
