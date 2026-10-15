import { ProtoField, ProtoMessage, ScalarType } from '../../pb/index.js';
import { bytesField, fixedBytesField, scalarField, stringField } from '../../tlv/index.js';

/** 拉取二维码的第 0x16 TLV。 */
export const qr0x16Schema = [
    scalarField('field0', 'uint32'),
    scalarField('appId', 'uint32'),
    scalarField('appIdQrCode', 'uint32'),
    bytesField('guid'),
    stringField('packageName', 'uint16'),
    stringField('ptVersion', 'uint16'),
    stringField('packageName2', 'uint16'),
];

/** 二维码生成参数 0x1b。 */
export const qr0x1bSchema = [
    scalarField('micro', 'uint32'),
    scalarField('version', 'uint32'),
    scalarField('size', 'uint32'),
    scalarField('margin', 'uint32'),
    scalarField('dpi', 'uint32'),
    scalarField('ecLevel', 'uint32'),
    scalarField('hint', 'uint32'),
    scalarField('field7', 'uint16'),
];

/** 请求位图 0x1d。 */
export const qr0x1dSchema = [
    scalarField('field0', 'uint8'),
    scalarField('miscBitmap', 'uint32'),
    scalarField('field2', 'uint32'),
    scalarField('field3', 'uint8'),
];

/** 设备 guid 0x33。 */
export const qr0x33Schema = [fixedBytesField('guid', 16)];

/** 0x35 平台系统版本。 */
export const qr0x35Schema = [scalarField('ptOsVersion', 'int32')];

/** 0x66 平台系统版本。 */
export const qr0x66Schema = [scalarField('ptOsVersion', 'int32')];

/** 0xd1 终端信息。 */
export const qr0xd1Schema = [bytesField('body')];

/** 0x17 二维码图片。 */
export const qr0x17Schema = [bytesField('qrCode')];

/** 0x1c 过期时间。 */
export const qr0x1cSchema = [scalarField('expirationInSec', 'uint32'), scalarField('expirationInMin', 'uint16')];

/** TransEmp31 请求体。 */
export const transEmp31Schema = [
    scalarField('appId', 'uint32'),
    scalarField('uin', 'uint64'),
    bytesField('a2'),
    scalarField('field4', 'uint8'),
    scalarField('field5', 'uint16'),
    bytesField('tlvPack'),
];

/** TransEmp31 响应体。 */
export const transEmp31ResponseSchema = [
    scalarField('dummyByte', 'uint8'),
    bytesField('signature', 'uint16'),
    bytesField('tlvPack'),
];

/** 拉取二维码请求的 TLV 集合。 */
export const qrFetchPack = [
    { tag: '0x16', schema: qr0x16Schema },
    { tag: '0x1b', schema: qr0x1bSchema },
    { tag: '0x1d', schema: qr0x1dSchema },
    { tag: '0x33', schema: qr0x33Schema },
    { tag: '0x35', schema: qr0x35Schema },
    { tag: '0x66', schema: qr0x66Schema },
    { tag: '0xd1', schema: qr0xd1Schema },
] as const;

/** 拉取二维码响应的 TLV 集合。 */
export const qrFetchResponsePack = [
    { tag: '0x17', schema: qr0x17Schema },
    { tag: '0x1c', schema: qr0x1cSchema },
    { tag: '0xd1', schema: qr0xd1Schema },
] as const;

/** TransEmp12（轮询）响应。 */
export const transEmp12ResponseSchema = [scalarField('qrCodeState', 'uint8'), bytesField('remaining')];

/** TransEmp12 已确认响应。 */
export const transEmp12ConfirmedSchema = [fixedBytesField('misc', 12), bytesField('tlvPack')];

/** 已确认响应的 TLV 集合。 */
export const qrConfirmPack = [
    { tag: '0x18', schema: [bytesField('a1')] },
    { tag: '0x19', schema: [bytesField('noPicSig')] },
    { tag: '0x1e', schema: [bytesField('tgtgtKey')] },
] as const;

/** 0xd1 请求体。 */
export const qrcode0xd1Body = ProtoMessage.of({
    system: ProtoField(
        1,
        () => ({
            os: ProtoField(1, ScalarType.STRING),
            name: ProtoField(2, ScalarType.STRING),
        }),
    ),
    type: ProtoField(4, ScalarType.BYTES),
});

/** 0xd1 响应体。 */
export const qrcode0xd1Response = ProtoMessage.of({
    url: ProtoField(2, ScalarType.STRING),
    qrSig: ProtoField(3, ScalarType.STRING),
});