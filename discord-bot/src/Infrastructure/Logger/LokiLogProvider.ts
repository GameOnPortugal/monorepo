import type LogProviderInterface from '../../Application/Logger/LogProviderInterface';
import LokiHttpTransport from './LokiHttpTransport.ts';
import winston from 'winston';

export default class LokiLogProvider implements LogProviderInterface {
    private readonly logger: winston.Logger;

    constructor(
        readonly address: string,
        readonly basicAuth?: string,
    ) {
        this.logger = winston.createLogger();
        this.logger.add(
            new LokiHttpTransport({
                host: address,
                ...(basicAuth !== undefined ? { basicAuth } : {}),
                // Was 'tedcrypto-campaign' — a copy-pasted label from a
                // different project entirely, which mislabelled every log
                // this bot ever sent to Loki (M3.5).
                labels: { job: 'game-on-portugal-bot' },
            }),
        );
    }

    debug(message: string, context?: Record<string, any>): void {
        this.logger.debug({
            level: 'debug',
            message,
            ...context,
        });
    }

    error(message: string, context?: Record<string, any>): void {
        this.logger.error({
            level: 'error',
            message,
            ...context,
        });
    }

    info(message: string, context?: Record<string, any>): void {
        this.logger.info({
            level: 'info',
            message,
            ...context,
        });
    }

    log(message: string, context?: Record<string, any>): void {
        this.logger.log({
            level: 'info',
            message,
            ...context,
        });
    }

    warn(message: string, context?: Record<string, any>): void {
        this.logger.warn({
            level: 'warn',
            message,
            ...context,
        });
    }
}
