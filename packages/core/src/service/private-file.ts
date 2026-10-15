import { randomBytes } from 'node:crypto';
import { DianaError, ErrorCode } from '../common/errors.js';
import { md510M, triSha1 } from '../crypto/digest.js';
import { FileUploadExt } from '../packet/highway.js';
import { PbSendMsg, PbSendMsgResponse, PrivateFileExtra } from '../packet/message/index.js';
import { privateFileUpload, privateFileUploadResponseContract } from '../packet/oidb/index.js';
import { int32IpToString, timestamp } from '../util/format.js';
import { randomInt } from '../util/random.js';
import type { MediaMetadata } from './media.js';
import type { HighwayService } from './highway.js';
import type { OidbService } from './oidb.js';
import type { SsoTransport } from './transport.js';

const PRIVATE_FILE_UPLOAD_COMMAND = 95;
/** 私聊文件 7 天有效期（秒）。 */
const EXPIRE_SECONDS = 7 * 24 * 60 * 60;

function randomUInt32(): number {
    return randomBytes(4).readUInt32BE(0);
}

/** 私聊文件上传预上传响应。 */
export interface PrivateFileUploadResp {
    uuid: string;
    boolFileExist: boolean;
    fileIdCrc?: string;
    uploadAddresses: { inIp: number; inPort: number }[];
    mediaPlatformUploadKey: Buffer;
}

/** 私聊文件服务。 */
export class PrivateFileService {
    constructor(
        private readonly oidb: OidbService,
        private readonly highway: HighwayService,
        private readonly transport: SsoTransport,
        private readonly selfUin: number,
    ) {}

    /** 上传并向好友发送文件（0xe37 预上传 → Highway 95 → PbSendMsg Trans211）。 */
    async upload(
        friendUin: number,
        friendUid: string,
        fileName: string,
        data: Buffer,
        meta: MediaMetadata,
    ): Promise<void> {
        const response = await this.oidb.call(privateFileUpload, privateFileUploadResponseContract, {
            subCommand: 1700,
            seq: 0,
            upload: {
                senderUid: this.transport.session.uid ?? '',
                receiverUid: friendUid,
                fileSize: BigInt(meta.size),
                fileName,
                md510M: md510M(data),
                sha1: meta.sha1,
                localPath: '/',
                md5: meta.md5,
                triSha1: triSha1(data),
            },
            field101: 3,
            field102: 1,
            field200: 1,
            field99999: Buffer.alloc(0),
        });
        const upload = response.upload;
        if (!upload) {
            throw new DianaError(ErrorCode.Protocol, '私聊文件上传响应缺少必要字段');
        }
        if (!upload.boolFileExist) {
            const ext = FileUploadExt.encode({
                unknown1: 100,
                unknown2: 1,
                unknown3: 0,
                entry: {
                    busiBuff: { senderUin: this.selfUin, receiverUin: friendUin },
                    fileEntry: {
                        fileSize: BigInt(meta.size),
                        md5: meta.md5,
                        // 私聊 fileEntry.checkKey 为全文件 SHA1
                        checkKey: meta.sha1,
                        md5S2: md510M(data),
                        sha3: triSha1(data),
                        fileId: upload.uuid,
                        uploadKey: upload.mediaPlatformUploadKey,
                    },
                    clientInfo: { clientType: 3, appId: '100', terminalType: 3, clientVer: '1.1.1', unknown: 4 },
                    fileNameInfo: { fileName },
                    host: {
                        hosts: upload.uploadAddresses.map((addr) => ({
                            url: { unknown: 1, host: int32IpToString(addr.inIp) },
                            port: addr.inPort,
                        })),
                    },
                },
                unknown200: 1,
            });
            await this.highway.upload(PRIVATE_FILE_UPLOAD_COMMAND, data, meta.md5, ext);
        }
        await this.sendFileMessage(friendUin, friendUid, fileName, data, upload);
    }

    /** 通过 PbSendMsg（Trans211）发送私聊文件消息，文件信息放在 msgContent。 */
    private async sendFileMessage(
        friendUin: number,
        friendUid: string,
        fileName: string,
        data: Buffer,
        upload: PrivateFileUploadResp,
    ): Promise<void> {
        const msgContent = PrivateFileExtra.encode({
            notOnlineFile: {
                fileType: 0,
                fileUuid: upload.uuid,
                // 官方语义：NotOnlineFile.fileMd5 填 md510M，非全文件 MD5
                fileMd5: md510M(data),
                fileName,
                fileSize: BigInt(data.length),
                subCmd: 1,
                dangerLevel: 0,
                expireTime: BigInt(timestamp() + EXPIRE_SECONDS),
                fileIdCrcMedia: upload.fileIdCrc ?? '',
            },
        });
        const reply = await this.transport.send(
            'MessageSvc.PbSendMsg',
            PbSendMsg.encode({
                routingHead: { trans211: { toUin: BigInt(friendUin), ccCmd: 4, uid: friendUid } },
                contentHead: { type: 1, subType: 0, c2cCmd: 0, pkgNum: 1, timestamp: timestamp() },
                body: { msgContent },
                clientSequence: randomUInt32(),
                random: randomInt(0, 0x7fffffff),
            }),
        );
        if (!('body' in reply)) {
            throw new DianaError(ErrorCode.Protocol, `发送私聊文件失败 (retcode=${reply.retcode}): ${reply.extra}`);
        }
        const parsed = PbSendMsgResponse.decode(reply.body);
        if (parsed.resultCode !== 0) {
            throw new DianaError(ErrorCode.Protocol, `发送私聊文件失败 (resultCode=${parsed.resultCode}): ${parsed.errMsg}`);
        }
    }
}
