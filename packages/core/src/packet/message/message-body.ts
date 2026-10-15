import { ProtoField, ProtoMessage, ScalarType } from '../../pb/index.js';
import { RichText } from './rich-text.js';

/** 消息体。 */
export const MessageBody = ProtoMessage.of({
    richText: ProtoField(1, () => RichText.fields, { optional: true }),
    msgContent: ProtoField(2, ScalarType.BYTES, { optional: true }),
});