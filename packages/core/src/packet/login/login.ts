import { ProtoField, ProtoMessage, ScalarType } from '../../pb/index.js';
import { bytesField, fixedBytesField, scalarField, stringField } from '../../tlv/index.js';

/** 登录请求 TLV 集合。 */
export const loginPack = [
    { tag: '0x106', schema: [bytesField('a1')] },
    { tag: '0x144', schema: [bytesField('tgtgtEncrypted')] },
    {
        tag: '0x116',
        schema: [
            scalarField('version', 'uint8'),
            scalarField('miscBitmap', 'uint32'),
            scalarField('subSigMap', 'uint32'),
            scalarField('appIdCount', 'uint8'),
            bytesField('appIdBytes'),
        ],
    },
    {
        tag: '0x142',
        schema: [scalarField('version', 'uint16'), stringField('packageName', 'uint16')],
    },
    { tag: '0x145', schema: [bytesField('guid')] },
    {
        tag: '0x018',
        schema: [
            scalarField('pingVersion', 'uint16'),
            scalarField('ssoVersion', 'uint32'),
            scalarField('field2', 'uint32'),
            scalarField('appClientVersion', 'uint32'),
            scalarField('uin', 'uint32'),
            scalarField('field5', 'uint16'),
            scalarField('field6', 'uint16'),
        ],
    },
    {
        tag: '0x141',
        schema: [stringField('field0', 'uint32'), scalarField('networkType', 'uint16'), stringField('apn', 'uint16')],
    },
    {
        tag: '0x177',
        schema: [scalarField('field0', 'uint8'), scalarField('buildTime', 'uint32'), stringField('wtLoginSdk', 'uint16')],
    },
    { tag: '0x191', schema: [scalarField('k', 'uint8')] },
    {
        tag: '0x100',
        schema: [
            scalarField('dbBufVersion', 'uint16'),
            scalarField('ssoVersion', 'uint32'),
            scalarField('appId', 'uint32'),
            scalarField('subAppId', 'uint32'),
            scalarField('appClientVersion', 'uint32'),
            scalarField('mainSigMap', 'uint32'),
        ],
    },
    {
        tag: '0x107',
        schema: [
            scalarField('picType', 'uint16'),
            scalarField('capType', 'uint8'),
            scalarField('picSize', 'uint16'),
            scalarField('retType', 'uint8'),
        ],
    },
    { tag: '0x318', schema: [] },
    { tag: '0x16a', schema: [bytesField('noPicSig')] },
    { tag: '0x166', schema: [scalarField('imageType', 'uint8')] },
    {
        tag: '0x521',
        schema: [scalarField('productType', 'uint32'), stringField('productDesc', 'uint16')],
    },
] as const;

/** 0x144 体 TLV 集合。 */
export const login0x144Pack = [
    { tag: '0x16e', schema: [stringField('deviceName')] },
    {
        tag: '0x147',
        schema: [scalarField('appId', 'uint32'), stringField('ptVersion', 'uint16'), stringField('packageName', 'uint16')],
    },
    {
        tag: '0x128',
        schema: [
            scalarField('field0', 'uint16'),
            scalarField('guidNew', 'uint8'),
            scalarField('guidAvailable', 'uint8'),
            scalarField('guidChanged', 'uint8'),
            scalarField('guidFlag', 'uint32'),
            stringField('os', 'uint16'),
            bytesField('guid', 'uint16'),
            stringField('brand', 'uint16'),
        ],
    },
    { tag: '0x124', schema: [fixedBytesField('empty', 12)] },
] as const;

/** 登录响应。 */
export const loginResponseSchema = [scalarField('command', 'uint16'), scalarField('state', 'uint8'), bytesField('tlvPack')];

/** 登录响应的 TLV 集合。 */
export const loginResponsePack = [
    { tag: '0x119', schema: [bytesField('encryptedTlv')] },
    {
        tag: '0x146',
        schema: [
            scalarField('state', 'uint32'),
            stringField('tag', 'uint16'),
            stringField('message', 'uint16'),
            scalarField('field0', 'uint32'),
        ],
    },
] as const;

/** 0x119 解密后的 TLV 集合。 */
export const login0x119Pack = [
    {
        tag: '0x11a',
        schema: [
            scalarField('faceId', 'uint16'),
            scalarField('age', 'uint8'),
            scalarField('gender', 'uint8'),
            stringField('nickname', 'uint8'),
        ],
    },
    { tag: '0x305', schema: [bytesField('d2Key')] },
    { tag: '0x543', schema: [bytesField('protoBody')] },
    { tag: '0x10a', schema: [bytesField('a2')] },
    { tag: '0x143', schema: [bytesField('d2')] },
    { tag: '0x106', schema: [bytesField('a1')] },
] as const;

/** 0x543 消息体，用于提取 uid。 */
export const login0x543Body = ProtoMessage.of({
    layer1: ProtoField(
        9,
        () => ({
            layer2: ProtoField(
                11,
                () => ({
                    uid: ProtoField(1, ScalarType.STRING),
                }),
            ),
        }),
    ),
});