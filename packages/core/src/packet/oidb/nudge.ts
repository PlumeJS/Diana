import { ProtoField, ScalarType } from '../../pb/index.js';
import { OidbSvcContract } from './contract.js';

/** 戳一戳（0xed3_1）。 */
export const nudgeContract = new OidbSvcContract(0xed3, 1, {
    toUin: ProtoField(1, ScalarType.UINT64),
    groupCode: ProtoField(2, ScalarType.UINT64, { optional: true }),
    msgSeq: ProtoField(3, ScalarType.UINT32, { optional: true }),
    msgRand: ProtoField(4, ScalarType.UINT32, { optional: true }),
    aioUin: ProtoField(5, ScalarType.UINT64, { optional: true }),
    nudgeType: ProtoField(6, ScalarType.UINT32, { optional: true }),
});
