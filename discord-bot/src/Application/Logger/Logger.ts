import type LogProviderInterface from './LogProviderInterface'

export default class Logger implements LogProviderInterface {
  constructor (
    private readonly providers: LogProviderInterface[] = [],
    private readonly context?: Record<string, any>
  ) {}

  info (message: string, context?: Record<string, any>): void {
    this.providers.forEach(provider => {
      provider.info(message, {
        ...this.context,
        ...context
      })
    })
  }

  error (message: string, context?: Record<string, any>): void {
    this.providers.forEach(provider => {
      provider.error(message, {
        ...this.context,
        ...context
      })
    })
  }

  debug (message: string, context?: Record<string, any>): void {
    this.providers.forEach(provider => {
      provider.debug(message, {
        ...this.context,
        ...context
      })
    })
  }

  log (message: string, context?: Record<string, any>): void {
    this.providers.forEach(provider => {
      provider.log(message, {
        ...this.context,
        ...context
      })
    })
  }

  warn (message: string, context?: Record<string, any>): void {
    this.providers.forEach(provider => {
      provider.warn(message, {
        ...this.context,
        ...context
      })
    })
  }
}
