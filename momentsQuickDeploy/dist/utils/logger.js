// Terminal color ANSI escape codes
const colors = {
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m',
};
export class Logger {
    context;
    appName;
    enableColors;
    timestampLocale;
    constructor(context, options = {}) {
        this.context = context;
        this.appName = options.appName ?? 'Moments';
        this.enableColors = options.colors ?? true;
        this.timestampLocale = options.timestampLocale ?? 'zh-CN';
    }
    color(value, color) {
        if (!this.enableColors) {
            return value;
        }
        return `${color}${value}${colors.reset}`;
    }
    getTimestamp() {
        return new Date().toLocaleString(this.timestampLocale, { hour12: false });
    }
    getPid() {
        return globalThis.process?.pid ?? '-';
    }
    print(level, message, color) {
        const prefix = this.color(`[${this.appName}] ${this.getPid()}  -`, colors.green);
        const timeStr = this.getTimestamp();
        const levelStr = this.color(level.padEnd(7), color);
        const contextStr = this.color(`[${this.context}]`, colors.yellow);
        const msgStr = this.color(message, color);
        console.log(`${prefix} ${timeStr}     ${levelStr} ${contextStr} ${msgStr}`);
    }
    log(message) {
        this.print('LOG', message, colors.green);
    }
    warn(message) {
        this.print('WARN', message, colors.yellow);
    }
    error(message, trace) {
        this.print('ERROR', message, colors.red);
        if (trace) {
            console.error(this.color(trace, colors.red));
        }
    }
    debug(message) {
        this.print('DEBUG', message, colors.cyan);
    }
}
