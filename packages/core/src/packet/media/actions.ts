import { OidbSvcContract } from '../oidb/index.js';
import { NTV2RichMediaRequest } from './request.js';
import { NTV2RichMediaResponse } from './response.js';

/** 群图片上传。 */
export const uploadGroupImage = new OidbSvcContract(0x11c4, 100, NTV2RichMediaRequest.fields);
export const uploadGroupImageResponse = new OidbSvcContract(0x11c4, 100, NTV2RichMediaResponse.fields);

/** 群图片下载。 */
export const downloadGroupImage = new OidbSvcContract(0x11c4, 200, NTV2RichMediaRequest.fields);
export const downloadGroupImageResponse = new OidbSvcContract(0x11c4, 200, NTV2RichMediaResponse.fields);

/** 私聊图片上传。 */
export const uploadPrivateImage = new OidbSvcContract(0x11c5, 100, NTV2RichMediaRequest.fields);
export const uploadPrivateImageResponse = new OidbSvcContract(0x11c5, 100, NTV2RichMediaResponse.fields);

/** 私聊图片下载。 */
export const downloadPrivateImage = new OidbSvcContract(0x11c5, 200, NTV2RichMediaRequest.fields);
export const downloadPrivateImageResponse = new OidbSvcContract(0x11c5, 200, NTV2RichMediaResponse.fields);

/** 群语音上传。 */
export const uploadGroupRecord = new OidbSvcContract(0x126e, 100, NTV2RichMediaRequest.fields);
export const uploadGroupRecordResponse = new OidbSvcContract(0x126e, 100, NTV2RichMediaResponse.fields);

/** 群语音下载。 */
export const downloadGroupRecord = new OidbSvcContract(0x126e, 200, NTV2RichMediaRequest.fields);
export const downloadGroupRecordResponse = new OidbSvcContract(0x126e, 200, NTV2RichMediaResponse.fields);

/** 私聊语音上传。 */
export const uploadPrivateRecord = new OidbSvcContract(0x126d, 100, NTV2RichMediaRequest.fields);
export const uploadPrivateRecordResponse = new OidbSvcContract(0x126d, 100, NTV2RichMediaResponse.fields);

/** 私聊语音下载。 */
export const downloadPrivateRecord = new OidbSvcContract(0x126d, 200, NTV2RichMediaRequest.fields);
export const downloadPrivateRecordResponse = new OidbSvcContract(0x126d, 200, NTV2RichMediaResponse.fields);

/** 群视频上传（含封面子文件）。 */
export const uploadGroupVideo = new OidbSvcContract(0x11ea, 100, NTV2RichMediaRequest.fields);
export const uploadGroupVideoResponse = new OidbSvcContract(0x11ea, 100, NTV2RichMediaResponse.fields);

/** 群视频下载。 */
export const downloadGroupVideo = new OidbSvcContract(0x11ea, 200, NTV2RichMediaRequest.fields);
export const downloadGroupVideoResponse = new OidbSvcContract(0x11ea, 200, NTV2RichMediaResponse.fields);

/** 私聊视频上传（含封面子文件）。 */
export const uploadPrivateVideo = new OidbSvcContract(0x11e9, 100, NTV2RichMediaRequest.fields);
export const uploadPrivateVideoResponse = new OidbSvcContract(0x11e9, 100, NTV2RichMediaResponse.fields);

/** 私聊视频下载。 */
export const downloadPrivateVideo = new OidbSvcContract(0x11e9, 200, NTV2RichMediaRequest.fields);
export const downloadPrivateVideoResponse = new OidbSvcContract(0x11e9, 200, NTV2RichMediaResponse.fields);