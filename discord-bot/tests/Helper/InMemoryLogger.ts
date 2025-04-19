import type LogProviderInterface from "../../src/Application/Logger/LogProviderInterface";

export default class InMemoryLogger implements LogProviderInterface {
    logs: Record<string, any>[] = [];

    hasLog(level: string, message: string) {
        return this.logs.some(log => log.level === level && log.message === message);
    }

    info(message: string, context?: Record<string, any>) {
        this.logs.push({ level: 'info', message, ...context });
    }

    error(message: string, context?: Record<string, any>) {
        this.logs.push({ level: 'error', message, ...context });
    }

    log(message: string, context?: Record<string, any>) {
        this.logs.push({ level: 'log', message, ...context });
    }

    warn(message: string, context?: Record<string, any>) {
        this.logs.push({ level: 'warn', message, ...context });
    }

    debug(message: string, context?: Record<string, any>) {
        this.logs.push({ level: 'debug', message, ...context });
    }
}