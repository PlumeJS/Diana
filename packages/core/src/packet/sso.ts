import { bytesField, fixedBytesField, nestedField, scalarField, stringField } from '../tlv/index.js';

/** SSO 协议版本。 */
export const SSO_PROTOCOL = 12;

/** SSO 包加密类型。 */
export enum EncryptionType {
    /** 明文。 */
    None = 0,
    /** 使用会话 d2Key 的 TEA 加密。 */
    TeaByD2Key = 1,
    /** 使用空密钥的 TEA 加密。 */
    TeaByEmptyKey = 2,
}

/** SSO 包压缩类型。 */
export enum CompressionType {
    None = 0,
    Zlib = 1,
    None2 = 4,
}

/** 包头中的固定填充块一。 */
export const HEADER_CONST_1 = Buffer.from('020000000000000000000000', 'hex');

/** 包头中的固定填充块二。 */
export const HEADER_CONST_2 = Buffer.from('00000004', 'hex');

/** 出站包头。 */
export const outgoingSsoHeaderSchema = [
    scalarField('sequence', 'uint32'),
    scalarField('subAppId', 'uint32'),
    scalarField('locale', 'uint32'),
    fixedBytesField('const1', 12),
    bytesField('a2', 'uint32', true),
    stringField('command', 'uint32', true),
    fixedBytesField('const2', 4),
    stringField('guid', 'uint32', true),
    fixedBytesField('const3', 4),
    stringField('version', 'uint16', true),
    bytesField('ssoReserveFields', 'uint32', true),
];

/** 出站包（内层，将被 TEA 加密）。 */
export const outgoingSsoPacketSchema = [
    nestedField('header', () => outgoingSsoHeaderSchema, 'uint32', true),
    bytesField('body', 'uint32', true),
];

/** 出站包外层信封（明文）。 */
export const outgoingSsoPacketWrapperSchema = [
    scalarField('protocol', 'uint32'),
    scalarField('encryptionType', 'uint8'),
    bytesField('d2', 'uint32', true),
    scalarField('flag3', 'uint8'),
    stringField('uin', 'uint32', true),
    bytesField('encrypted'),
];

/** 入站包外层信封。 */
export const incomingSsoPacketWrapperSchema = [
    scalarField('protocol', 'uint32'),
    scalarField('encryptionType', 'uint8'),
    scalarField('flag2', 'uint8'),
    stringField('uin', 'uint32', true),
    bytesField('packet'),
];

/** 入站包头。 */
export const incomingSsoHeaderSchema = [
    scalarField('sequence', 'uint32'),
    scalarField('retcode', 'int32'),
    stringField('extra', 'uint32', true),
    stringField('command', 'uint32', true),
    bytesField('msgCookie', 'uint32', true),
    scalarField('compressionType', 'int32'),
    bytesField('reserveField', 'uint32', true),
];

/** 入站包（内层）。 */
export const incomingSsoPacketSchema = [
    nestedField('header', () => incomingSsoHeaderSchema, 'uint32', true),
    bytesField('raw', 'uint32', true),
];
