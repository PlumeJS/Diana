import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 读取版本号。
 * 单文件可执行程序在打包时通过 Bun define 注入 `process.env.DIANA_VERSION`；
 * 开发/源码运行（dist/banner.js）时回退到读取 ../package.json。
 */
function readVersion(): string {
    const injected = process.env.DIANA_VERSION;
    if (injected) {
        return injected;
    }
    try {
        const pkgPath = resolve(import.meta.dirname, '../package.json');
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
        return pkg.version ?? '0.0.0';
    } catch {
        return '0.0.0';
    }
}

/** ANSI 颜色。 */
const CYAN = '\u001b[96m';
const BLUE = '\u001b[94m';
const MAGENTA = '\u001b[95m';
const BOLD = '\u001b[1m';
const RESET = '\u001b[0m';

/** Diana ASCII 大字（参考 milky 启动横幅风格）。 */
const BANNER_LINES = [
    '██████╗ ██╗ █████╗ ███╗   ██╗ █████╗ ',
    '██╔══██╗██║██╔══██╗████╗  ██║██╔══██╗',
    '██║  ██║██║███████║██╔██╗ ██║███████║',
    '██║  ██║██║██╔══██║██║╚██╗██║██╔══██║',
    '██████╔╝██║██║  ██║██║ ╚████║██║  ██║',
    '╚═════╝ ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝',
];

/**
 * 打印启动横幅：ASCII 大字 + 渐变着色 + 版本信息表。
 * 非 TTY 时输出纯文本，避免污染日志文件。
 */
export function printBanner(extra?: Record<string, string>): void {
    const tty = process.stdout.isTTY;
    // 六行大字按行做 青→蓝→紫 渐变
    const gradient = tty ? [CYAN, CYAN, BLUE, BLUE, MAGENTA, MAGENTA] : ['', '', '', '', '', ''];
    const lines = BANNER_LINES.map((line, i) => `${gradient[i]}${line}${tty ? RESET : ''}`);
    process.stdout.write(`${lines.join('\n')}\n`);

    const entries: [string, string][] = [
        ['version', readVersion()],
        ...Object.entries(extra ?? {}),
        ['built at', new Date().toLocaleString()],
    ];
    const width = Math.max(...entries.map(([key]) => key.length));
    for (const [key, value] of entries) {
        const label = `${key.padEnd(width)} :`;
        process.stdout.write(tty ? `${CYAN}${label}${RESET} ${value}\n` : `${label} ${value}\n`);
    }
    process.stdout.write(tty ? `${BOLD}${CYAN}${'─'.repeat(46)}${RESET}\n` : `${'─'.repeat(46)}\n`);
}
