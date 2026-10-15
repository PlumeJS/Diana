import { ProtoField, ProtoMessage, ScalarType } from '../../pb/index.js';

/** 文本样式属性。 */
export const Attribute = ProtoMessage.of({
    codePage: ProtoField(1, ScalarType.INT32),
    time: ProtoField(2, ScalarType.INT32),
    random: ProtoField(3, ScalarType.INT32),
    color: ProtoField(4, ScalarType.INT32),
    size: ProtoField(5, ScalarType.INT32),
    effect: ProtoField(6, ScalarType.INT32),
    charSet: ProtoField(7, ScalarType.INT32),
    pitchAndFamily: ProtoField(8, ScalarType.INT32),
    fontName: ProtoField(9, ScalarType.STRING, { optional: true }),
    reserveData: ProtoField(10, ScalarType.BYTES, { optional: true }),
});

/** 富文本内容。 */
export const RichText = ProtoMessage.of({
    attribute: ProtoField(1, () => Attribute.fields, { optional: true }),
    elements: ProtoField(2, ScalarType.BYTES, { repeated: true }),
});