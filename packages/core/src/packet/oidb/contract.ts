import { DianaError, ErrorCode } from '../../common/errors.js';
import { ProtoMessage } from '../../pb/index.js';
import type { InferProtoModel, InferProtoModelInput, ProtoModel } from '../../pb/index.js';
import { OidbBase } from './base.js';

/**
 * OIDB 服务契约：将业务消息体包进 {@link OidbBase} 进行编解码。
 * 命令字为 `OidbSvcTrpcTcp.0x{command}_{subCommand}`。
 */
export class OidbSvcContract<const T extends ProtoModel> {
    private readonly body: ProtoMessage<T>;

    constructor(
        readonly command: number,
        readonly subCommand: number,
        bodyFields: T,
        readonly useReserved = false,
        /** 写入 Oidb.Service（字段 2）的值，默认等于 subCommand；0x6d8 等命令按子功能区分。 */
        private readonly service: number = subCommand,
    ) {
        this.body = ProtoMessage.of(bodyFields);
    }

    /** 对应的 SSO 命令字。 */
    get ssoCommand(): string {
        return `OidbSvcTrpcTcp.0x${this.command.toString(16)}_${this.subCommand}`;
    }

    /** 编码请求体。 */
    encode(data: InferProtoModelInput<T>): Buffer {
        return OidbBase.encode({
            command: this.command,
            subCommand: this.service,
            body: this.body.encode(data),
            properties: [],
            reserved: this.useReserved ? 1 : 0,
        });
    }

    /** 解析响应体，返回外层结构与业务消息体。 */
    tryDecode(data: Buffer) {
        const decoded = OidbBase.decode(data);
        return {
            ...decoded,
            body: decoded.body ? this.body.decode(decoded.body) : undefined,
        };
    }

    /** 解析响应体，出错时抛异常。 */
    decodeBodyOrThrow(data: Buffer): InferProtoModel<T> {
        const decoded = this.tryDecode(data);
        if (decoded.errorCode !== 0 || !decoded.body) {
            throw new DianaError(
                ErrorCode.Protocol,
                `OIDB 请求失败 (0x${this.command.toString(16)}_${this.subCommand}, errorCode=${decoded.errorCode}): ${decoded.errorMsg}`,
            );
        }
        return decoded.body;
    }
}