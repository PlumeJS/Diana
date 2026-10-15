import { readFile } from 'node:fs/promises';
import { DianaError, ErrorCode } from '@diana/core';

/**
 * 解析 OneBot 的文件来源为字节。
 * 支持 `base64://`、`data:` URL、`file://`、`http(s)://`、本地路径，以及裸 base64。
 */
export async function resolveFile(file: string): Promise<Buffer> {
    if (file.startsWith('base64://')) {
        return Buffer.from(file.slice('base64://'.length), 'base64');
    }
    if (file.startsWith('data:')) {
        const comma = file.indexOf(',');
        if (comma < 0) {
            throw new DianaError(ErrorCode.Validation, '非法的 data URL');
        }
        const payload = file.slice(comma + 1);
        return file.slice(5, comma).includes(';base64')
            ? Buffer.from(payload, 'base64')
            : Buffer.from(decodeURIComponent(payload), 'utf8');
    }
    if (file.startsWith('http://') || file.startsWith('https://')) {
        const response = await fetch(file);
        if (!response.ok) {
            throw new DianaError(ErrorCode.Network, `下载媒体失败 (${response.status}): ${file}`);
        }
        return Buffer.from(await response.arrayBuffer());
    }
    if (file.startsWith('file://')) {
        return readFile(new URL(file));
    }
    try {
        return await readFile(file);
    } catch {
        return Buffer.from(file, 'base64');
    }
}