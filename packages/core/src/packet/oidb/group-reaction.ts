import { ProtoField, ScalarType } from '../../pb/index.js';
import { OidbSvcContract } from './contract.js';

/** 群消息贴表情回应-添加（0x9082_1）。 */
export const addGroupReactionContract = new OidbSvcContract(0x9082, 1, {
    groupCode: ProtoField(2, ScalarType.UINT64),
    sequence: ProtoField(3, ScalarType.UINT64),
    code: ProtoField(4, ScalarType.STRING),
    reactionType: ProtoField(5, ScalarType.UINT32),
});

/** 群消息贴表情回应-取消（0x9082_2）。 */
export const removeGroupReactionContract = new OidbSvcContract(0x9082, 2, {
    groupCode: ProtoField(2, ScalarType.UINT64),
    sequence: ProtoField(3, ScalarType.UINT64),
    code: ProtoField(4, ScalarType.STRING),
    reactionType: ProtoField(5, ScalarType.UINT32),
});
