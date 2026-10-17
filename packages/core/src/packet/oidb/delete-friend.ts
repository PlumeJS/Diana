import { ProtoField, ScalarType } from '../../pb/index.js';
import { OidbSvcContract } from './contract.js';

/** 删除好友（0x126b_0，对齐 acidify Oidb.0x126b_0 / DeleteFriend）。 */
export const deleteFriendContract = new OidbSvcContract(0x126b, 0, {
    body: ProtoField(
        1,
        () => ({
            targetUid: ProtoField(1, ScalarType.STRING),
            field2: ProtoField(
                2,
                () => ({
                    field1: ProtoField(1, ScalarType.UINT32),
                    field2: ProtoField(2, ScalarType.UINT32),
                    field3: ProtoField(
                        3,
                        () => ({
                            field1: ProtoField(1, ScalarType.UINT32),
                            field2: ProtoField(2, ScalarType.UINT32),
                            field3: ProtoField(3, ScalarType.UINT32),
                        }),
                        { optional: true },
                    ),
                }),
                { optional: true },
            ),
            block: ProtoField(3, ScalarType.BOOL),
            field4: ProtoField(4, ScalarType.BOOL, { optional: true }),
        }),
        { optional: true },
    ),
});
