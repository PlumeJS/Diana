import { ScalarType } from './types.js';
import type { ProtoFieldSpec, ProtoFieldType } from './types.js';

/** 字段可选性配置。 */
export interface ProtoFieldOptions<O extends boolean = boolean, R extends boolean = boolean> {
    /** 字段可缺省。 */
    optional?: O;
    /** 字段重复（数组）。 */
    repeated?: R;
    /** 重复的标量是否按 packed 编码，默认自动判定。 */
    packed?: boolean;
}

/** 定义一个 protobuf 字段。 */
export function ProtoField<
    const T extends ProtoFieldType,
    const O extends boolean = false,
    const R extends boolean = false,
>(
    fieldNumber: number,
    type: T,
    options: ProtoFieldOptions<O, R> = {},
): ProtoFieldSpec<T, O, R> {
    const optional = (options.optional ?? false) as O;
    const repeated = (options.repeated ?? false) as R;
    if (optional && repeated) {
        throw new Error('repeated 字段不能同时声明为 optional');
    }
    const packable = typeof type !== 'function' && type !== ScalarType.STRING && type !== ScalarType.BYTES;
    return {
        fieldNumber,
        type,
        optional,
        repeated,
        packed: options.packed ?? (repeated && packable),
    };
}
