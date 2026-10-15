/** TLV 标量字段类型。 */
export type TlvScalarType =
    | 'uint8'
    | 'uint16'
    | 'uint32'
    | 'uint64'
    | 'int8'
    | 'int16'
    | 'int32'
    | 'int64'
    | 'float'
    | 'double';

/** 变长字段的长度前缀类型。 */
export type TlvLengthPrefix = 'none' | 'uint8' | 'uint16' | 'uint32';

interface TlvFieldBase {
    /** 在反序列化结果中的字段名。 */
    name: string;
    /** 长度前缀类型，默认 `none`。 */
    lengthPrefix: TlvLengthPrefix;
    /** 长度是否包含前缀本身。 */
    lengthIncludesPrefix: boolean;
}

/** 标量字段。 */
export interface TlvScalarField {
    kind: 'scalar';
    name: string;
    type: TlvScalarType;
}

/** 定长字节字段。 */
export interface TlvFixedBytesField {
    kind: 'fixed';
    name: string;
    length: number;
}

/** 变长字节字段。 */
export interface TlvBytesField extends TlvFieldBase {
    kind: 'bytes';
}

/** 变长字符串字段。 */
export interface TlvStringField extends TlvFieldBase {
    kind: 'string';
}

/** 嵌套 TLV 字段。 */
export interface TlvNestedField extends TlvFieldBase {
    kind: 'nested';
    schema: () => TlvSchema;
}

/** TLV 字段。 */
export type TlvField = TlvScalarField | TlvFixedBytesField | TlvBytesField | TlvStringField | TlvNestedField;

/** TLV 结构定义。 */
export type TlvSchema = readonly TlvField[];

/** TLV 数据（字段名到值的映射）。 */
export type TlvData = Record<string, unknown>;

/** 定义标量字段。 */
export function scalarField(name: string, type: TlvScalarType): TlvScalarField {
    return { kind: 'scalar', name, type };
}

/** 定义定长字节字段。 */
export function fixedBytesField(name: string, length: number): TlvFixedBytesField {
    return { kind: 'fixed', name, length };
}

/** 定义变长字节字段。 */
export function bytesField(
    name: string,
    lengthPrefix: TlvLengthPrefix = 'none',
    lengthIncludesPrefix = false,
): TlvBytesField {
    return { kind: 'bytes', name, lengthPrefix, lengthIncludesPrefix };
}

/** 定义变长字符串字段。 */
export function stringField(
    name: string,
    lengthPrefix: TlvLengthPrefix = 'none',
    lengthIncludesPrefix = false,
): TlvStringField {
    return { kind: 'string', name, lengthPrefix, lengthIncludesPrefix };
}

/** 定义嵌套 TLV 字段。 */
export function nestedField(
    name: string,
    schema: () => TlvSchema,
    lengthPrefix: TlvLengthPrefix = 'none',
    lengthIncludesPrefix = false,
): TlvNestedField {
    return { kind: 'nested', name, schema, lengthPrefix, lengthIncludesPrefix };
}
