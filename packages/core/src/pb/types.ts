/** protobuf 标量类型。 */
export enum ScalarType {
    DOUBLE = 1,
    FLOAT = 2,
    INT64 = 3,
    UINT64 = 4,
    INT32 = 5,
    FIXED64 = 6,
    FIXED32 = 7,
    BOOL = 8,
    STRING = 9,
    BYTES = 12,
    UINT32 = 13,
    SFIXED32 = 15,
    SFIXED64 = 16,
    SINT32 = 17,
    SINT64 = 18,
}

/** protobuf 线类型。 */
export enum WireType {
    Varint = 0,
    Fixed64 = 1,
    LengthDelimited = 2,
    Fixed32 = 5,
}

/** 字段类型：标量或嵌套消息（惰性求值以支持递归）。 */
export type ProtoFieldType = ScalarType | (() => ProtoModel);

/** 字段定义。 */
export interface ProtoFieldSpec<
    T extends ProtoFieldType = ProtoFieldType,
    O extends boolean = boolean,
    R extends boolean = boolean,
> {
    fieldNumber: number;
    type: T;
    optional: O;
    repeated: R;
    packed: boolean;
}

/** 消息模型：字段名到字段定义的映射。 */
export type ProtoModel = Record<string, ProtoFieldSpec<ProtoFieldType, boolean, boolean>>;

/** `ScalarType` 到 TypeScript 类型的映射。 */
export type ScalarTypeToTsType<T extends ScalarType> = T extends
    | ScalarType.DOUBLE
    | ScalarType.FLOAT
    | ScalarType.INT32
    | ScalarType.FIXED32
    | ScalarType.UINT32
    | ScalarType.SFIXED32
    | ScalarType.SINT32
    ? number
    : T extends ScalarType.INT64 | ScalarType.UINT64 | ScalarType.FIXED64 | ScalarType.SFIXED64 | ScalarType.SINT64
      ? bigint
      : T extends ScalarType.BOOL
        ? boolean
        : T extends ScalarType.STRING
          ? string
          : T extends ScalarType.BYTES
            ? Buffer
            : never;

type InferFieldType<T extends ProtoFieldType> = T extends ScalarType
    ? ScalarTypeToTsType<T>
    : T extends () => ProtoModel
      ? InferProtoModel<ReturnType<T>>
      : never;

type InferField<Spec> = Spec extends ProtoFieldSpec<infer T, infer O, infer R>
    ? [R] extends [true]
        ? InferFieldType<T>[]
        : [O] extends [true]
          ? InferFieldType<T> | undefined
          : InferFieldType<T>
    : never;

type OptionalKeys<T extends ProtoModel> = {
    [K in keyof T]: [T[K]['optional']] extends [true] ? K : never;
}[keyof T];

type RequiredKeys<T extends ProtoModel> = Exclude<keyof T, OptionalKeys<T>>;

/** 解码结果类型。 */
export type InferProtoModel<T extends ProtoModel> = {
    [K in OptionalKeys<T>]?: InferField<T[K]>;
} & {
    [K in RequiredKeys<T>]: InferField<T[K]>;
};

/** 嵌套消息字段也接受已编码字节（原样透传，避免解码-重编码丢失未建模字段）。 */
type InferFieldTypeInput<T extends ProtoFieldType> = T extends ScalarType
    ? ScalarTypeToTsType<T>
    : T extends () => ProtoModel
      ? InferProtoModelInput<ReturnType<T>> | Buffer
      : never;

type InferFieldInput<Spec> = Spec extends ProtoFieldSpec<infer T, infer O, infer R>
    ? [R] extends [true]
        ? InferFieldTypeInput<T>[]
        : [O] extends [true]
          ? InferFieldTypeInput<T> | undefined
          : InferFieldTypeInput<T>
    : never;

/** 编码入参类型（各字段可选，嵌套消息递归可选）。 */
export type InferProtoModelInput<T extends ProtoModel> = Partial<{
    [K in keyof T]: InferFieldInput<T[K]>;
}>;
