import { createLogger as createWinstonLogger, format, transports } from 'winston';
import type { Logger as WinstonLogger } from 'winston';

/** 日志等级。 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/** 简洁的日志接口。 */
export interface Logger {
    trace(message: string, ...args: unknown[]): void;
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    fatal(message: string, ...args: unknown[]): void;
}

/** 自定义等级，数值越小优先级越高。 */
const LEVELS: Record<LogLevel, number> = { fatal: 0, error: 1, warn: 2, info: 3, debug: 4, trace: 5 };

/** ANSI 控制码。 */
const RESET = '\u001b[0m';
const DIM = '\u001b[90m';
const BOLD = '\u001b[1m';
const YELLOW = '\u001b[93m';
const GREEN = '\u001b[92m';
const BLUE = '\u001b[94m';
const MAGENTA = '\u001b[95m';

/** 等级颜色（ANSI）：仅用于级别标签着色，warn 黄、error 红醒目。 */
const COLORS: Record<LogLevel, string> = {
    fatal: '\u001b[1;35m',
    error: '\u001b[1;31m',
    warn: '\u001b[1;33m',
    info: '\u001b[1;32m',
    debug: '\u001b[90m',
    trace: '\u001b[90m',
};

/** 正文颜色：仅告警及以上着色，信息级以下保持终端默认色，避免满屏同色。 */
const BODY_COLORS: Record<LogLevel, string> = {
    fatal: '\u001b[31m',
    error: '\u001b[31m',
    warn: '\u001b[33m',
    info: '',
    debug: '',
    trace: '',
};

/** 模块名调色板（亮色）：按名称稳定取色，让不同模块一眼可辨。 */
const MODULE_COLORS = ['\u001b[96m', '\u001b[94m', '\u001b[95m', '\u001b[92m', '\u001b[93m', '\u001b[91m'];

/** 按模块名稳定选取一个颜色，保证同名同色。 */
function moduleColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    }
    return MODULE_COLORS[hash % MODULE_COLORS.length] ?? MAGENTA;
}

/** 等级显示名（对齐主流框架：WARN/ERRO 缩写由右对齐补偿）。 */
const LABELS: Record<LogLevel, string> = {
    fatal: 'FATAL',
    error: 'ERROR',
    warn: 'WARN',
    info: 'INFO',
    debug: 'DEBUG',
    trace: 'TRACE',
};

/** 格式化附加参数：Error 打印堆栈，其余尽量字符串化。 */
function formatArgs(args: unknown[]): string {
    return args
        .map((arg) => {
            if (arg instanceof Error) {
                return arg.stack ?? `${arg.name}: ${arg.message}`;
            }
            return typeof arg === 'string' ? arg : JSON.stringify(arg);
        })
        .join(' ');
}

let root: WinstonLogger | undefined;
let level: LogLevel = 'info';

/** 设置全局日志等级；在创建 logger 前调用即可生效，之后调用会即时更新。 */
export function setLogLevel(next: LogLevel): void {
    level = next;
    if (root) {
        root.level = next;
    }
}

/**
 * 创建并缓存根 logger。
 * 通过 `process.stdout` 流输出，Windows 控制台会走宽字符接口，中文不会因代码页而乱码。
 */
function rootLogger(): WinstonLogger {
    root ??= createWinstonLogger({
        levels: LEVELS,
        level,
        format: format.combine(
            format.timestamp({ format: 'HH:mm:ss' }),
            format.printf((info) => {
                const name = info.level as LogLevel;
                const args = Array.isArray(info['args']) ? (info['args'] as unknown[]) : [];
                const tty = process.stdout.isTTY;
                const color = tty ? COLORS[name] ?? '' : '';
                const bodyColor = tty ? BODY_COLORS[name] ?? '' : '';
                const moduleName = String(info['name'] ?? '');
                const moduleTag = tty ? moduleColor(moduleName) : '';
                const dim = tty ? DIM : '';
                const reset = tty ? RESET : '';
                const message = String(info['message']);
                const extra = args.length > 0 ? ` ${formatArgs(args)}` : '';
                const body = `${message}${extra}`;
                return (
                    `${dim}[${String(info['timestamp'])}]${reset} ` +
                    `${color}${LABELS[name]}${reset} ` +
                    `${moduleTag}(${moduleName})${reset} ` +
                    `${bodyColor}${body}${reset}`
                );
            }),
        ),
        transports: [new transports.Console()],
    });
    return root;
}

/** 按等级输出日志，附加参数以对象形式携带。 */
function write(logger: WinstonLogger, level: LogLevel, message: string, args: unknown[]): void {
    logger.log(level, message, { args });
}

/** 创建具名 logger。 */
export function createLogger(name: string): Logger {
    const logger = rootLogger().child({ name });
    return {
        trace: (message, ...args) => write(logger, 'trace', message, args),
        debug: (message, ...args) => write(logger, 'debug', message, args),
        info: (message, ...args) => write(logger, 'info', message, args),
        warn: (message, ...args) => write(logger, 'warn', message, args),
        error: (message, ...args) => write(logger, 'error', message, args),
        fatal: (message, ...args) => write(logger, 'fatal', message, args),
    };
}

type Paintable = string | number | undefined;

/** 日志着色工具（仅在 TTY 下生效），供事件摘要等场景高亮关键信息。对齐 milky 配色习惯。 */
export const paint = {
    bold: (text: string): string => (process.stdout.isTTY ? `${BOLD}${text}${RESET}` : text),
    dim: (text: string): string => (process.stdout.isTTY ? `${DIM}${text}${RESET}` : text),
    /** 群名（亮蓝）。 */
    group: (text: Paintable): string => (text === undefined ? '' : paintWith(BLUE, String(text))),
    /** 发送者/昵称（亮绿）。 */
    sender: (text: Paintable): string => (text === undefined ? '' : paintWith(GREEN, String(text))),
    /** 操作/ID 等关键值（亮黄）。 */
    highlight: (text: Paintable): string => (text === undefined ? '' : paintWith(YELLOW, String(text))),
};

function paintWith(color: string, text: string): string {
    return process.stdout.isTTY ? `${color}${text}${RESET}` : text;
}

/** 具名颜色（供事件标签等场景稳定调用）。 */
export type PaintColor = 'cyan' | 'blue' | 'magenta' | 'green' | 'yellow' | 'red';

/** 具名颜色对应的 ANSI 码（亮色）。 */
const NAMED_COLORS: Record<PaintColor, string> = {
    cyan: '\u001b[96m',
    blue: '\u001b[94m',
    magenta: '\u001b[95m',
    green: '\u001b[92m',
    yellow: '\u001b[93m',
    red: '\u001b[91m',
};

/** 按具名颜色着色文本（仅在 TTY 下生效）。 */
export function paintColor(color: PaintColor, text: string): string {
    return paintWith(NAMED_COLORS[color], text);
}
