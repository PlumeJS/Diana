import { createLogger } from '../common/logger.js';
import {
    Event0x210SubType,
    Event0x2DCSubType,
    Event0x2DCSubType16Field13,
    FriendRecall,
    FriendRequest,
    FriendRequestExtractVia,
    GeneralGrayTip,
    GroupAdminChange,
    GroupEssenceMessageChangeSetFlag,
    groupGeneral0x2dcSchema,
    GroupGeneral0x2DCBody,
    GroupInvitation,
    GroupInvitationRequest,
    GroupJoinRequest,
    GroupMemberChange,
    GroupMute,
    GroupNameChange,
    OperatorInfo,
    PushMsg,
    PushMsgBody,
    PushMsgType,
} from '../packet/message/index.js';
import type { InferProtoModel } from '../pb/index.js';
import { decodeTlv } from '../tlv/index.js';
import { MESSAGE_PUSH_COMMAND } from './message.js';
import type { PushHandler, SsoTransport } from './transport.js';

/** 好友撤回。 */
export interface FriendRecallNotice {
    type: 'friendRecall';
    fromUid: string;
    toUid: string;
    sequence: number;
    tip: string;
}

/** 通知事件。 */
export type Notification =
    | { type: 'friendRequest'; fromUin: number; fromUid: string; message: string; via: string }
    | FriendRecallNotice
    | { type: 'groupMemberIncrease'; groupUin: number; memberUid: string; changeType: number; operatorUid?: string }
    | { type: 'groupMemberDecrease'; groupUin: number; memberUid: string; changeType: number; operatorUid?: string }
    | { type: 'groupJoinRequest'; groupUin: number; memberUid: string }
    | { type: 'groupInvitedJoinRequest'; groupUin: number; targetUid: string; invitorUid: string }
    | { type: 'groupInvitation'; groupUin: number; invitorUid: string }
    | { type: 'groupAdminChange'; groupUin: number; targetUid: string; set: boolean }
    | { type: 'groupMute'; groupUin: number; operatorUid: string; targetUid?: string; duration: number; all: boolean }
    | {
          type: 'groupRecall';
          groupUin: number;
          operatorUid: string;
          tip: string;
          messages: Array<{ sequence: number; authorUid: string }>;
      }
    | {
          type: 'groupEssenceMessageChange';
          groupUin: number;
          msgSequence: number;
          memberUin: number;
          operatorUin: number;
          add: boolean;
      }
    | { type: 'groupNameChange'; groupUin: number; name: string; operatorUid: string }
    | { type: 'groupReaction'; groupUin: number; sequence: number; operatorUid: string; code: string; reactionType: number; count: number; isAdd: boolean }
    | { type: 'friendPoke'; operatorUin: number; targetUin: number; action: string; actionImgUrl: string; suffix?: string }
    | { type: 'groupPoke'; groupUin: number; operatorUin: number; targetUin: number; action: string; actionImgUrl: string; suffix?: string };

/** 通知处理器。 */
export type NotifyHandler = (event: Notification) => void;

function resolveOperatorUid(info: Buffer | undefined): string | undefined {
    if (!info) {
        return undefined;
    }
    return OperatorInfo.decode(info).body.uid;
}

/** 灰条 bizType：戳一戳。 */
const GRAY_TIP_BIZ_POKE = 12;

/** 从灰条模板参数中提取戳一戳信息。 */
function buildPoke(tip: InferProtoModel<typeof GeneralGrayTip.fields>, fallbackUin: number) {
    if (tip.bizType !== GRAY_TIP_BIZ_POKE) {
        return undefined;
    }
    const params = new Map(tip.templateParams.map((param) => [param.key, param.value]));
    const toUin = (value: string | undefined): number => {
        const uin = Number.parseInt(value ?? '', 10);
        return Number.isNaN(uin) ? 0 : uin;
    };
    return {
        operatorUin: toUin(params.get('uin_str1')) || fallbackUin,
        targetUin: toUin(params.get('uin_str2')),
        action: params.get('action_str') ?? params.get('alt_str1') ?? '',
        actionImgUrl: params.get('action_img_url') ?? '',
        suffix: params.get('suffix_str'),
    };
}

/**
 * 解包 `0x2DC` 群事件外层，布局为 `groupUin(4) + 1 字节 + 长度(2) + proto`。
 * 只有下列子类型使用该布局；其它子类型布局不同，强行解包会错位，因此直接放弃（与官方一致：只处理已注册的子类型）。
 */
function parseGroupEvent(
    content: Buffer,
    subType: number,
): InferProtoModel<typeof GroupGeneral0x2DCBody.fields> | undefined {
    if (
        subType !== Event0x2DCSubType.GroupRecall &&
        subType !== Event0x2DCSubType.SubType16 &&
        subType !== Event0x2DCSubType.GroupGrayTip &&
        subType !== Event0x2DCSubType.GroupEssenceMessageChange
    ) {
        return undefined;
    }
    try {
        return GroupGeneral0x2DCBody.decode(decodeTlv(groupGeneral0x2dcSchema, content)['body'] as Buffer);
    } catch {
        return undefined;
    }
}

/** 解析消息推送体为通知事件。 */
export function parseNotification(body: Buffer): Notification | undefined {
    const push = PushMsg.decode(body);
    const message = PushMsgBody.decode(push.message);
    const type = message.contentHead.type;
    const subType = message.contentHead.subType ?? 0;
    const content = message.body?.msgContent;

    if (type === PushMsgType.GroupJoinRequest && content) {
        const parsed = GroupJoinRequest.decode(content);
        return { type: 'groupJoinRequest', groupUin: parsed.groupUin, memberUid: parsed.memberUid };
    }
    if (type === PushMsgType.GroupInvitedJoinRequest && content) {
        const parsed = GroupInvitationRequest.decode(content);
        if (parsed.command !== 87) {
            return undefined;
        }
        const inner = parsed.info.inner;
        return {
            type: 'groupInvitedJoinRequest',
            groupUin: inner.groupUin,
            targetUid: inner.targetUid,
            invitorUid: inner.invitorUid,
        };
    }
    if (type === PushMsgType.GroupInvitation && content) {
        const parsed = GroupInvitation.decode(content);
        return { type: 'groupInvitation', groupUin: parsed.groupUin, invitorUid: parsed.invitorUid };
    }
    if (type === PushMsgType.GroupAdminChange && content) {
        const parsed = GroupAdminChange.decode(content);
        if (parsed.body.set) {
            return { type: 'groupAdminChange', groupUin: parsed.groupUin, targetUid: parsed.body.set.targetUid, set: true };
        }
        if (parsed.body.unset) {
            return { type: 'groupAdminChange', groupUin: parsed.groupUin, targetUid: parsed.body.unset.targetUid, set: false };
        }
        return undefined;
    }
    if (type === PushMsgType.GroupMemberIncrease && content) {
        const parsed = GroupMemberChange.decode(content);
        return {
            type: 'groupMemberIncrease',
            groupUin: parsed.groupUin,
            memberUid: parsed.memberUid,
            changeType: parsed.type,
            operatorUid: resolveOperatorUid(parsed.operatorInfo),
        };
    }
    if (type === PushMsgType.GroupMemberDecrease && content) {
        const parsed = GroupMemberChange.decode(content);
        return {
            type: 'groupMemberDecrease',
            groupUin: parsed.groupUin,
            memberUid: parsed.memberUid,
            changeType: parsed.type,
            operatorUid: resolveOperatorUid(parsed.operatorInfo),
        };
    }
    if (type === PushMsgType.Event0x210 && content) {
        if (subType === Event0x210SubType.FriendRequest) {
            const parsed = FriendRequest.decode(content);
            return {
                type: 'friendRequest',
                fromUin: message.responseHead.fromUin,
                fromUid: parsed.body.fromUid,
                message: parsed.body.message,
                via: parsed.body.via ?? FriendRequestExtractVia.decode(content).body.via,
            };
        }
        if (subType === Event0x210SubType.FriendGrayTip) {
            const poke = buildPoke(GeneralGrayTip.decode(content), message.responseHead.fromUin);
            return poke ? { type: 'friendPoke', ...poke } : undefined;
        }
        if (subType === Event0x210SubType.FriendRecall || subType === Event0x210SubType.FriendSelfRecall) {
            const parsed = FriendRecall.decode(content).body;
            return {
                type: 'friendRecall',
                fromUid: parsed.fromUid,
                toUid: parsed.toUid,
                sequence: parsed.sequence,
                tip: parsed.tipInfo.tip,
            };
        }
        return undefined;
    }
    if (type === PushMsgType.Event0x2DC && content) {
        if (subType === Event0x2DCSubType.GroupMute) {
            const mute = GroupMute.decode(content);
            return {
                type: 'groupMute',
                groupUin: mute.groupUin,
                operatorUid: mute.operatorUid,
                targetUid: mute.info.state.targetUid,
                duration: mute.info.state.duration,
                all: !mute.info.state.targetUid,
            };
        }
        const wrapper = parseGroupEvent(content, subType);
        if (!wrapper) {
            return undefined;
        }
        if (subType === Event0x2DCSubType.GroupGrayTip) {
            if (!wrapper.generalGrayTip) {
                return undefined;
            }
            const poke = buildPoke(wrapper.generalGrayTip, 0);
            return poke ? { type: 'groupPoke', groupUin: wrapper.groupUin, ...poke } : undefined;
        }
        if (subType === Event0x2DCSubType.GroupRecall) {
            const recall = wrapper.recall;
            if (!recall) {
                return undefined;
            }
            return {
                type: 'groupRecall',
                groupUin: wrapper.groupUin,
                operatorUid: recall.operatorUid,
                tip: recall.tipInfo?.tip ?? '',
                messages: recall.recallMessages.map((item) => ({ sequence: item.sequence, authorUid: item.authorUid })),
            };
        }
        if (subType === Event0x2DCSubType.GroupEssenceMessageChange) {
            const essence = wrapper.essenceMessageChange;
            if (!essence) {
                return undefined;
            }
            return {
                type: 'groupEssenceMessageChange',
                groupUin: essence.groupUin,
                msgSequence: essence.msgSequence,
                memberUin: essence.memberUin,
                operatorUin: essence.operatorUin,
                add: essence.setFlag === GroupEssenceMessageChangeSetFlag.Add,
            };
        }
        if (subType === Event0x2DCSubType.SubType16) {
            if (wrapper.field13 === Event0x2DCSubType16Field13.GroupNameChange && wrapper.eventParam) {
                const parsed = GroupNameChange.decode(wrapper.eventParam);
                return {
                    type: 'groupNameChange',
                    groupUin: wrapper.groupUin,
                    name: parsed.name,
                    operatorUid: wrapper.operatorUid ?? '',
                };
            }
            if (wrapper.field13 === Event0x2DCSubType16Field13.GroupReaction) {
                const reaction = wrapper.reaction;
                if (!reaction) {
                    return undefined;
                }
                const inner = reaction.data.data;
                return {
                    type: 'groupReaction',
                    groupUin: wrapper.groupUin,
                    sequence: inner.target.sequence,
                    operatorUid: inner.data.operatorUid,
                    code: inner.data.code,
                    reactionType: inner.data.reactionType ?? 0,
                    count: inner.data.count,
                    isAdd: inner.data.type === 1,
                };
            }
        }
        return undefined;
    }
    return undefined;
}

/** 通知事件服务。 */
export class NotifyService {
    private readonly logger = createLogger('NotifyService');
    private readonly handlers = new Set<NotifyHandler>();
    private readonly pushHandler: PushHandler;

    constructor(private readonly transport: SsoTransport) {
        this.pushHandler = (packet) => {
            if (packet.command !== MESSAGE_PUSH_COMMAND) {
                return;
            }
            try {
                const event = parseNotification(packet.body);
                if (event) {
                    for (const handler of this.handlers) {
                        handler(event);
                    }
                }
            } catch (error) {
                this.logger.debug('解析通知事件失败', error);
            }
        };
        this.transport.onPush(this.pushHandler);
    }

    /** 注册通知处理器。 */
    onNotify(handler: NotifyHandler): void {
        this.handlers.add(handler);
    }

    /** 移除通知处理器。 */
    offNotify(handler: NotifyHandler): void {
        this.handlers.delete(handler);
    }

    /** 释放推送监听。 */
    dispose(): void {
        this.transport.offPush(this.pushHandler);
        this.handlers.clear();
    }
}