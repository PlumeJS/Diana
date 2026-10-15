// 本地打包：用 Bun 把 packages/app 交叉编译为 win / linux / mac / macarm 四个平台的单文件可执行程序。
// 说明：Bun 仅作为打包工具使用，运行时代码不依赖 Bun。
// 用法：
//   node scripts/package.mjs              # 打包全部平台
//   node scripts/package.mjs win linux    # 只打包指定平台
// 运行前需先执行 `pnpm build`（根 `pnpm package` 已串联）。
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * 定位 bun 可执行文件。
 * Windows 上 `bun` 通常是 npm 全局安装的 shim（无扩展名的 sh 脚本 / .cmd / .ps1），
 * Node 的 execFile 无法直接执行，因此优先解析出真实的 bun.exe；
 * 同时避免使用 shell，防止 `--define` 参数的引号被 cmd.exe 破坏。
 */
function resolveBun() {
    if (process.env.BUN_BIN) {
        return process.env.BUN_BIN;
    }
    if (process.platform !== 'win32') {
        return 'bun';
    }
    const candidates = [];
    for (const dir of (process.env.PATH ?? '').split(delimiter)) {
        if (!dir) {
            continue;
        }
        candidates.push(join(dir, 'bun.exe'));
        candidates.push(join(dir, 'node_modules', 'bun', 'bin', 'bun.exe'));
    }
    return candidates.find((candidate) => existsSync(candidate)) ?? 'bun';
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = resolve(root, 'packages/app');
const entry = resolve(appDir, 'src/index.ts');
const outDir = resolve(root, 'sea');
const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version ?? '0.0.0';

// Windows 可执行文件图标（由 assets/icon.svg 光栅化而来），仅 Windows 目标支持嵌入。
const windowsIcon = resolve(appDir, 'assets/icon.ico');

/** 平台别名 → Bun 编译目标与产物文件名。 */
const TARGETS = {
    win: { target: 'bun-windows-x64', name: 'diana-win-x64.exe', icon: windowsIcon },
    linux: { target: 'bun-linux-x64', name: 'diana-linux-x64' },
    mac: { target: 'bun-darwin-x64', name: 'diana-macos-x64' },
    macarm: { target: 'bun-darwin-arm64', name: 'diana-macos-arm64' },
};

const requested = process.argv.slice(2);
const keys = requested.length > 0 ? requested : Object.keys(TARGETS);
const unknown = keys.filter((key) => !(key in TARGETS));
if (unknown.length > 0) {
    process.stderr.write(`未知平台: ${unknown.join(', ')}（可选: ${Object.keys(TARGETS).join(', ')}）\n`);
    process.exit(1);
}

mkdirSync(outDir, { recursive: true });
for (const key of keys) {
    const { target, name, icon } = TARGETS[key];
    const output = resolve(outDir, name);
    process.stdout.write(`打包 ${key} → ${output}\n`);
    const args = [
        'build',
        entry,
        '--compile',
        `--target=${target}`,
        `--outfile=${output}`,
        // 注入版本号：横幅优先读取该变量，避免运行时依赖 package.json 文件
        '--define',
        `process.env.DIANA_VERSION=${JSON.stringify(version)}`,
    ];
    if (icon && existsSync(icon)) {
        args.push(`--windows-icon=${icon}`);
    }
    execFileSync(resolveBun(), args, { cwd: appDir, stdio: 'inherit' });
}
process.stdout.write(`打包完成，产物位于 ${outDir}\n`);
