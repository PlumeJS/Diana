import { bytesField, scalarField } from '../../tlv/index.js';

/** 登录结果状态。 */
export enum LoginState {
    Success = 0,
    Slider = 2,
    SmsRequired = 160,
}

/** 二维码扫描状态。 */
export enum QrCodeState {
    Confirmed = 0,
    CodeExpired = 17,
    WaitingForScan = 48,
    WaitingForConfirm = 53,
    Canceled = 54,
}

/** wtlogin 响应公共头。 */
export const wtLoginResponseBaseSchema = [
    scalarField('internalLength', 'uint16'),
    scalarField('version', 'uint16'),
    scalarField('commandId', 'uint16'),
    scalarField('sequence', 'uint16'),
    scalarField('uin', 'uint32'),
    scalarField('flag', 'uint8'),
    scalarField('retryTime', 'uint16'),
    bytesField('encrypted'),
];