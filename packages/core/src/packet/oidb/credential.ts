import { ProtoField, ScalarType } from '../../pb/index.js';
import { OidbSvcContract } from './contract.js';

/** 拉取网页 Cookie（OIDB 0x102A_0），body 为待查询的域名列表。 */
export const fetchCookiesContract = new OidbSvcContract(0x102a, 0, {
    domains: ProtoField(1, ScalarType.STRING, { repeated: true }),
});

/** 拉取网页 Cookie 的响应，urls 为 `{ key, value }` 键值对列表。 */
export const fetchCookiesResponseContract = new OidbSvcContract(0x102a, 0, {
    urls: ProtoField(
        1,
        () => ({
            key: ProtoField(1, ScalarType.STRING),
            value: ProtoField(2, ScalarType.STRING),
        }),
        { repeated: true },
    ),
});

/** 拉取 client key（OIDB 0x102A_1），请求体为空。 */
export const fetchClientKeyContract = new OidbSvcContract(0x102a, 1, {});

/** 拉取 client key 的响应。 */
export const fetchClientKeyResponseContract = new OidbSvcContract(0x102a, 1, {
    field1: ProtoField(2, ScalarType.UINT32),
    clientKey: ProtoField(3, ScalarType.STRING, { optional: true }),
    expiration: ProtoField(4, ScalarType.UINT32),
});
