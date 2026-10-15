import { z } from 'zod';

/** 文本段。 */
export const textSchema = z.object({
    type: z.literal('text'),
    data: z.object({ text: z.string() }),
});

/** 图片段。 */
export const imageSchema = z.object({
    type: z.literal('image'),
    data: z.object({
        file: z.string(),
        type: z.enum(['flash', 'show']).optional(),
        url: z.string().optional(),
        cache: z.literal(0).optional(),
        proxy: z.literal(0).optional(),
        timeout: z.number().optional(),
    }),
});

/** 表情段。id≥260 时可指定以超级表情（大表情）发送。 */
export const faceSchema = z.object({
    type: z.literal('face'),
    data: z.object({ id: z.string(), large: z.boolean().optional() }),
});

/** @ 段。 */
export const atSchema = z.object({
    type: z.literal('at'),
    data: z.object({ qq: z.union([z.string(), z.literal('all')]), name: z.string().optional() }),
});

/** 回复段。 */
export const replySchema = z.object({
    type: z.literal('reply'),
    data: z.object({ id: z.string() }),
});

/** 语音段。 */
export const recordSchema = z.object({
    type: z.literal('record'),
    data: z.object({
        file: z.string(),
        magic: z.literal(0).optional(),
        url: z.string().optional(),
        cache: z.literal(0).optional(),
        proxy: z.literal(0).optional(),
        timeout: z.number().optional(),
    }),
});

/** 视频段。 */
export const videoSchema = z.object({
    type: z.literal('video'),
    data: z.object({
        file: z.string(),
        url: z.string().optional(),
        cache: z.literal(0).optional(),
        proxy: z.literal(0).optional(),
        timeout: z.number().optional(),
    }),
});

/** JSON 卡片段。 */
export const jsonSchema = z.object({
    type: z.literal('json'),
    data: z.object({ data: z.string() }),
});

/** 戳一戳段。 */
export const pokeSchema = z.object({
    type: z.literal('poke'),
    data: z.object({ type: z.string(), id: z.string(), name: z.string().optional() }),
});

/** 合并转发段。 */
export const forwardSchema = z.object({
    type: z.literal('forward'),
    data: z.object({ id: z.string() }),
});

/** 合并转发节点段。 */
export const nodeSchema = z.object({
    type: z.literal('node'),
    data: z.object({
        user_id: z.string().optional(),
        nickname: z.string().optional(),
        content: z.unknown(),
    }),
});

/** 商城表情段。 */
export const mfaceSchema = z.object({
    type: z.literal('mface'),
    data: z.object({
        emoji_id: z.string(),
        emoji_package_id: z.string().optional(),
        key: z.string().optional(),
        summary: z.string().optional(),
    }),
});

/** 猜拳段。 */
export const rpsSchema = z.object({
    type: z.literal('rps'),
    data: z.object({ result: z.string().optional() }),
});

/** 骰子段。 */
export const diceSchema = z.object({
    type: z.literal('dice'),
    data: z.object({ result: z.string().optional() }),
});

/** 窗口抖动段。 */
export const shakeSchema = z.object({
    type: z.literal('shake'),
    data: z.object({ id: z.string().optional() }),
});

/** 文件段：兼容标准 `data` 嵌套结构与 Karin 等客户端发送的扁平结构。 */
export const fileSchema = z.object({
    type: z.literal('file'),
    data: z
        .object({
            file: z.string(),
            url: z.string().optional(),
            file_id: z.string().optional(),
            name: z.string().optional(),
        })
        .optional(),
    file: z.string().optional(),
    url: z.string().optional(),
    file_id: z.string().optional(),
    name: z.string().optional(),
    size: z.number().optional(),
});

/** 全部消息段。 */
export const segmentSchema = z.discriminatedUnion('type', [
    textSchema,
    imageSchema,
    faceSchema,
    atSchema,
    replySchema,
    recordSchema,
    videoSchema,
    jsonSchema,
    pokeSchema,
    forwardSchema,
    nodeSchema,
    mfaceSchema,
    rpsSchema,
    diceSchema,
    shakeSchema,
    fileSchema,
]);

/** 消息：纯文本或消息段数组。 */
export const messageSchema = z.union([z.string(), z.array(segmentSchema)]);

export type TextSegment = z.infer<typeof textSchema>;
export type ImageSegment = z.infer<typeof imageSchema>;
export type FaceSegment = z.infer<typeof faceSchema>;
export type AtSegment = z.infer<typeof atSchema>;
export type ReplySegment = z.infer<typeof replySchema>;
export type RecordSegment = z.infer<typeof recordSchema>;
export type VideoSegment = z.infer<typeof videoSchema>;
export type JsonSegment = z.infer<typeof jsonSchema>;
export type PokeSegment = z.infer<typeof pokeSchema>;
export type ForwardSegment = z.infer<typeof forwardSchema>;
export type NodeSegment = z.infer<typeof nodeSchema>;
export type MfaceSegment = z.infer<typeof mfaceSchema>;
export type RpsSegment = z.infer<typeof rpsSchema>;
export type DiceSegment = z.infer<typeof diceSchema>;
export type ShakeSegment = z.infer<typeof shakeSchema>;
export type FileSegment = z.infer<typeof fileSchema>;

/** 消息段联合类型。 */
export type Segment = z.infer<typeof segmentSchema>;

/** 消息类型。 */
export type Message = z.infer<typeof messageSchema>;

/** 校验并解析消息，失败时抛出。 */
export function parseMessage(input: unknown): Message {
    return messageSchema.parse(input);
}

/** 校验并解析消息，失败时返回 null。 */
export function tryParseMessage(input: unknown): Message | null {
    const result = messageSchema.safeParse(input);
    return result.success ? result.data : null;
}
