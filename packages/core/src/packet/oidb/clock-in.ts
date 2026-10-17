import { ProtoField, ScalarType } from '../../pb/index.js';
import { OidbSvcContract } from './contract.js';

/** 群打卡请求（对齐 Lagrange Oidb_0xEB7）。 */
export const groupClockInContract = new OidbSvcContract(0xeb7, 1, {
    signInWrite: ProtoField(
        2,
        () => ({
            uid: ProtoField(1, ScalarType.STRING),
            groupId: ProtoField(2, ScalarType.STRING),
            clientVersion: ProtoField(3, ScalarType.STRING),
        }),
        { optional: true },
    ),
});

/** 群打卡响应。 */
export const groupClockInResponseContract = new OidbSvcContract(0xeb7, 1, {
    signInWrite: ProtoField(
        2,
        () => ({
            ret: ProtoField(
                1,
                () => ({
                    code: ProtoField(1, ScalarType.INT32),
                    msg: ProtoField(2, ScalarType.STRING, { optional: true }),
                }),
                { optional: true },
            ),
            doneInfo: ProtoField(
                2,
                () => ({
                    leftTitleWord: ProtoField(1, ScalarType.STRING, { optional: true }),
                    rightDescWord: ProtoField(2, ScalarType.STRING, { optional: true }),
                    belowPortraitWords: ProtoField(3, ScalarType.STRING, { repeated: true }),
                    recordUrl: ProtoField(4, ScalarType.STRING, { optional: true }),
                }),
                { optional: true },
            ),
        }),
        { optional: true },
    ),
});
