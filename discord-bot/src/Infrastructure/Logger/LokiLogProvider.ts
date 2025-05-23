import type LogProviderInterface from '../../Application/Logger/LogProviderInterface'
import LokiTransport from 'winston-loki'
import winston from 'winston'

export default class LokiLogProvider implements LogProviderInterface {
  private readonly logger: winston.Logger

  constructor (
    readonly address: string,
    readonly basicAuth?: string
  ) {
    this.logger = winston.createLogger()
    this.logger.add(new LokiTransport({
      host: address,
      json: true,
      ...basicAuth !== undefined ? { basicAuth } : {},
      labels: { job: 'tedcrypto-campaign' }
    }))
  }

  debug (message: string, context?: Record<string, any>): void {
    this.logger.debug({
      level: 'debug',
      message,
      ...context
    })
  }

  error (message: string, context?: Record<string, any>): void {
    this.logger.error({
      level: 'error',
      message,
      ...context
    })
  }

  info (message: string, context?: Record<string, any>): void {
    this.logger.info({
      level: 'info',
      message,
      ...context
    })
  }

  log (message: string, context?: Record<string, any>): void {
    this.logger.log({
      level: 'info',
      message,
      ...context
    })
  }

  warn (message: string, context?: Record<string, any>): void {
    this.logger.warn({
      level: 'warn',
      message,
      ...context
    })
  }
}
