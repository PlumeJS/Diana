import { ProtoField, ScalarType } from '../../pb/index.js';
import { OidbSvcContract } from './contract.js';

/** 设置/取消群精华消息（0xeac_1 设 / 0xeac_2 取消）。 */
const essenceBody = {
    groupUin: ProtoField(1, ScalarType.UINT64),
    sequence: ProtoField(2, ScalarType.UINT64),
    random: ProtoField(3, ScalarType.UINT32),
};

/** 设置群精华消息响应。 */
const essenceResponseBody = {
    wording: ProtoField(1, ScalarType.STRING, { optional: true }),
    digestUin: ProtoField(2, ScalarType.UINT64, { optional: true }),
    digestTime: ProtoField(3, ScalarType.UINT32, { optional: true }),
    errorCode: ProtoField(10, ScalarType.UINT32, { optional: true }),
};

/** 设置群精华消息。 */
export const setGroupEssence = new OidbSvcContract(0xeac, 1, essenceBody);
export const setGroupEssenceResponse = new OidbSvcContract(0xeac, 1, essenceResponseBody);

/** 取消群精华消息。 */
export const unsetGroupEssence = new OidbSvcContract(0xeac, 2, essenceBody);
export const unsetGroupEssenceResponse = new OidbSvcContract(0xeac, 2, essenceResponseBody);
