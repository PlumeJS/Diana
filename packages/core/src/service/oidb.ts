import { DianaError, ErrorCode } from '../common/errors.js';
import type { OidbSvcContract } from '../packet/oidb/index.js';
import type { InferProtoModel, InferProtoModelInput, ProtoModel } from '../pb/index.js';
import type { SsoTransport } from './transport.js';

/** 通用 OIDB 调用。 */
export class OidbService {
    constructor(private readonly transport: SsoTransport) {}

    /** 发送 OIDB 请求并解析响应业务体。 */
    async call<T extends ProtoModel, R extends ProtoModel>(
        request: OidbSvcContract<T>,
        response: OidbSvcContract<R>,
        body: InferProtoModelInput<T>,
    ): Promise<InferProtoModel<R>> {
        const reply = await this.transport.send(request.ssoCommand, request.encode(body));
        if (!('body' in reply)) {
            throw new DianaError(ErrorCode.Oidb, `OIDB 请求失败 (retcode=${reply.retcode}): ${reply.extra}`);
        }
        return response.decodeBodyOrThrow(reply.body);
    }

    /** 发送 OIDB 请求（不关心响应体，仅校验错误码）。 */
    async send<T extends ProtoModel>(request: OidbSvcContract<T>, body: InferProtoModelInput<T>): Promise<void> {
        const reply = await this.transport.send(request.ssoCommand, request.encode(body));
        if (!('body' in reply)) {
            throw new DianaError(ErrorCode.Oidb, `OIDB 请求失败 (retcode=${reply.retcode}): ${reply.extra}`);
        }
        const decoded = request.tryDecode(reply.body);
        if (decoded.errorCode !== 0) {
            throw new DianaError(
                ErrorCode.Oidb,
                `OIDB 请求失败 (0x${request.command.toString(16)}_${request.subCommand}, errorCode=${decoded.errorCode}): ${decoded.errorMsg}`,
            );
        }
    }
}