import { DianaError, ErrorCode } from '../common/errors.js';
import { createLogger } from '../common/logger.js';
import type { Logger } from '../common/logger.js';
import {
    setGroupEssence,
    setGroupEssenceResponse,
    unsetGroupEssence,
    unsetGroupEssenceResponse,
} from '../packet/oidb/index.js';
import type { SystemService } from './system.js';
import type { OidbService } from './oidb.js';

/** 精华消息条目。 */
export interface EssenceMessage {
    /** 群号。 */
    groupUin: number;
    /** 消息序列号。 */
    sequence: number;
    /** 消息 random。 */
    random: number;
    senderUin: number;
    senderNickname: string;
    senderTime: number;
    /** 添加精华的操作者 QQ 号。 */
    operatorUin: number;
    operatorNickname: string;
    operatorTime: number;
    /** 纯文本预览。 */
    content: string;
}

/** 精华消息列表结果。 */
export interface EssenceListResult {
    messages: EssenceMessage[];
    isEnd: boolean;
}

/** digest_list 响应条目。 */
interface DigestItem {
    msg_seq?: number;
    msg_random?: number;
    sender_uin?: string;
    sender_nick?: string;
    sender_time?: number;
    add_digest_uin?: string;
    add_digest_nick?: string;
    add_digest_time?: number;
    msg_content?: Array<{ text?: string }>;
}

/** 群精华消息服务。 */
export class EssenceService {
    private readonly logger: Logger;

    constructor(
        private readonly oidb: OidbService,
        private readonly system: SystemService,
    ) {
        this.logger = createLogger('EssenceService');
    }

    /** 设置群精华消息（0xeac_1）。需要消息的 random，可从缓存或历史消息中获取。 */
    async set(groupUin: number, sequence: number, random: number): Promise<void> {
        const response = await this.oidb.call(setGroupEssence, setGroupEssenceResponse, {
            groupUin: BigInt(groupUin),
            sequence: BigInt(sequence),
            random,
        });
        if ((response.errorCode ?? 0) !== 0) {
            throw new DianaError(ErrorCode.Oidb, `设置精华消息失败: ${response.wording ?? '未知错误'}`);
        }
    }

    /** 取消群精华消息（0xeac_2）。 */
    async unset(groupUin: number, sequence: number, random: number): Promise<void> {
        const response = await this.oidb.call(unsetGroupEssence, unsetGroupEssenceResponse, {
            groupUin: BigInt(groupUin),
            sequence: BigInt(sequence),
            random,
        });
        if ((response.errorCode ?? 0) !== 0) {
            throw new DianaError(ErrorCode.Oidb, `取消精华消息失败: ${response.wording ?? '未知错误'}`);
        }
    }

    /** 拉取群精华消息列表（Web API digest_list，对齐 acidify GroupOps.getGroupEssenceMessages）。 */
    async fetchList(groupUin: number, pageIndex = 0, pageSize = 50): Promise<EssenceListResult> {
        const cookies = await this.system.fetchCookies(['qun.qq.com']);
        const bkn = await this.system.fetchCsrfToken();
        const url =
            `https://qun.qq.com/cgi-bin/group_digest/digest_list` +
            `?random=7800&X-CROSS-ORIGIN=fetch&group_code=${groupUin}` +
            `&page_start=${pageIndex}&page_limit=${pageSize}&bkn=${bkn}`;
        const response = await fetch(url, {
            headers: {
                cookie: Object.entries(cookies)
                    .map(([key, value]) => `${key}=${value}`)
                    .join('; '),
            },
        });
        if (!response.ok) {
            throw new DianaError(ErrorCode.Network, `拉取精华消息列表失败 (status=${response.status})`);
        }
        const body = (await response.json()) as { retcode?: number; retmsg?: string; data?: { msg_list?: DigestItem[]; is_end?: boolean } };
        if ((body.retcode ?? -1) !== 0) {
            throw new DianaError(ErrorCode.Network, `拉取精华消息列表失败: ${body.retmsg ?? body.retcode}`);
        }
        const messages = (body.data?.msg_list ?? []).map((item) => ({
            groupUin,
            sequence: item.msg_seq ?? 0,
            random: item.msg_random ?? 0,
            senderUin: Number(item.sender_uin ?? 0),
            senderNickname: item.sender_nick ?? '',
            senderTime: item.sender_time ?? 0,
            operatorUin: Number(item.add_digest_uin ?? 0),
            operatorNickname: item.add_digest_nick ?? '',
            operatorTime: item.add_digest_time ?? 0,
            content: (item.msg_content ?? [])
                .map((element) => element.text ?? '')
                .join(''),
        }));
        this.logger.debug(`拉取精华消息列表成功 (group=${groupUin}, count=${messages.length})`);
        return { messages, isEnd: body.data?.is_end ?? true };
    }
}
