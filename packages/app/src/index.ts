import { existsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { start } from './app.js';
import { printBanner } from './banner.js';
import { DEFAULT_CONFIG_YAML, loadConfig } from './config.js';

export * from './app.js';
export * from './config.js';
export * from './session.js';

/**
 * 可执行文件所在目录；由 node/bun 直接执行源码（开发模式）时返回 null，
 * 避免把配置写入运行时自身的安装目录。
 */
function executableDir(): string | null {
    const name = basename(process.execPath).toLowerCase();
    if (name === 'node' || name === 'node.exe' || name === 'bun' || name === 'bun.exe') {
        return null;
    }
    return dirname(process.execPath);
}

/**
 * 解析配置文件路径；均不存在时在首个可写目录生成默认配置并返回 null。
 * 优先可执行文件所在目录：打包为单文件后 `process.execPath` 是唯一定位手段
 * （Bun 编译产物中 `import.meta.dir` 指向虚拟路径），并依次回退到工作目录与
 * 用户主目录——macOS 经 Gatekeeper 隔离时应用目录只读，需要可写的回退位置。
 */
function resolveConfigPath(): string | null {
    const dirs = [...new Set([executableDir(), process.cwd(), homedir()].filter((dir): dir is string => dir !== null))];
    for (const dir of dirs) {
        const path = resolve(dir, 'config.yaml');
        if (existsSync(path)) {
            return path;
        }
    }
    for (const dir of dirs) {
        const path = resolve(dir, 'config.yaml');
        try {
            writeFileSync(path, DEFAULT_CONFIG_YAML);
            process.stdout.write(`未找到配置，已生成默认配置 ${path}，请按需修改后重新运行。\n`);
            return null;
        } catch {
            // 目录不可写，尝试下一个
        }
    }
    process.stdout.write('未找到配置且无法写入默认配置，请手动创建 config.yaml 后重新运行。\n');
    return null;
}

/**
 * 启动入口。
 * 配置文件依次在可执行文件所在目录、工作目录、用户主目录中查找，
 * 均缺少 config.yaml 时在首个可写目录写入内置默认模板并提示修改。
 */
async function main(): Promise<void> {
    printBanner();
    const configPath = resolveConfigPath();
    if (!configPath) {
        return;
    }

    const app = await start(loadConfig(configPath));

    let stopping = false;
    const shutdown = async (): Promise<void> => {
        if (stopping) {
            return;
        }
        stopping = true;
        await app.stop();
        process.exit(0);
    };
    process.on('SIGINT', () => void shutdown());
    process.on('SIGTERM', () => void shutdown());
}

void main();
