import { ProtoField, ScalarType } from '../../pb/index.js';
import { OidbSvcContract } from './contract.js';

/** 按 uid 拉取用户信息。 */
export const fetchUserInfoByUidContract = new OidbSvcContract(0xfe1, 2, {
    uid: ProtoField(1, ScalarType.STRING),
    keys: ProtoField(3, () => ({ key: ProtoField(1, ScalarType.UINT32) }), { repeated: true }),
});

/** 按 uin 拉取用户信息。 */
export const fetchUserInfoByUinContract = new OidbSvcContract(
    0xfe1,
    2,
    {
        uin: ProtoField(1, ScalarType.UINT32),
        keys: ProtoField(3, () => ({ key: ProtoField(1, ScalarType.UINT32) }), { repeated: true }),
    },
    true,
);

/** 拉取用户信息响应。 */
export const fetchUserInfoResponseContract = new OidbSvcContract(0xfe1, 2, {
    body: ProtoField(1, () => ({
        properties: ProtoField(2, () => ({
            numberProperties: ProtoField(
                1,
                () => ({
                    key: ProtoField(1, ScalarType.UINT32),
                    value: ProtoField(2, ScalarType.UINT32),
                }),
                { repeated: true },
            ),
            bytesProperties: ProtoField(
                2,
                () => ({
                    key: ProtoField(1, ScalarType.UINT32),
                    value: ProtoField(2, ScalarType.BYTES),
                }),
                { repeated: true },
            ),
        })),
        uin: ProtoField(3, ScalarType.UINT32),
    })),
});