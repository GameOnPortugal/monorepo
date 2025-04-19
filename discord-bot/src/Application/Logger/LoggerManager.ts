import type LogProviderInterface from './LogProviderInterface'
import { injectable } from 'inversify'
import Logger from './Logger'

@injectable()
export default class LoggerManager {
  private readonly providers: LogProviderInterface[] = []

  addProvider (provider: LogProviderInterface): void {
    this.providers.push(provider)
  }

  createLogger (context?: Record<string, string>): Logger {
    return new Logger(
      this.providers,
      context
    )
  }
}
