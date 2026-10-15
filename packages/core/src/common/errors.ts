/** 统一错误码。 */
export enum ErrorCode {
    /** 未知错误。 */
    Unknown = 'UNKNOWN',
    /** 网络相关错误。 */
    Network = 'NETWORK',
    /** 协议解析错误。 */
    Protocol = 'PROTOCOL',
    /** 登录相关错误。 */
    Login = 'LOGIN',
    /** OIDB 请求错误。 */
    Oidb = 'OIDB',
    /** 入参校验失败。 */
    Validation = 'VALIDATION',
}

/** 携带错误码的通用错误类型。 */
export class DianaError extends Error {
    readonly code: ErrorCode;

    constructor(code: ErrorCode, message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'DianaError';
        this.code = code;
    }
}
