import { ProtoField, ProtoMessage, ScalarType } from '../../pb/index.js';
import type { ProtoFieldSpec } from '../../pb/index.js';

/** 闪传上传体。 */
const FlashTransferUploadBody = {
    field1: ProtoField(1, ScalarType.BYTES, { optional: true }),
    uKey: ProtoField(2, ScalarType.STRING),
    start: ProtoField(3, ScalarType.UINT32),
    end: ProtoField(4, ScalarType.UINT32),
    sha1: ProtoField(5, ScalarType.BYTES, { optional: true }),
    sha1StateV: ProtoField(6, () => FlashTransferSha1StateV, { optional: true }),
    body: ProtoField(7, ScalarType.BYTES, { optional: true }),
} satisfies Record<string, ProtoFieldSpec>;

/** 流式 SHA1 状态列表。 */
const FlashTransferSha1StateV = {
    state: ProtoField(1, ScalarType.BYTES, { repeated: true }),
} satisfies Record<string, ProtoFieldSpec>;

/** 闪传切片上传请求（对齐 acidify FlashTransferUploadReq）。 */
export const FlashTransferUploadReq = ProtoMessage.of({
    field1: ProtoField(1, ScalarType.UINT32),
    appId: ProtoField(2, ScalarType.UINT32),
    field3: ProtoField(3, ScalarType.UINT32),
    body: ProtoField(107, () => FlashTransferUploadBody, { optional: true }),
});

/** 闪传切片上传响应（对齐 acidify FlashTransferUploadResp）。 */
export const FlashTransferUploadResp = ProtoMessage.of({
    status: ProtoField(5, ScalarType.STRING, { optional: true }),
});
