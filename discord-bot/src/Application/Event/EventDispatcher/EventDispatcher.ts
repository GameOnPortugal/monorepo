import type EventHandler from './EventHandler'
import { inject, injectable, multiInject } from 'inversify'
import { TYPES } from '../../../Infrastructure/DependencyInjection/types'
import type Event from './Event'
import Logger from '../../Logger/Logger'

@injectable()
export default class EventDispatcher {
  constructor (
    @multiInject(TYPES.EventHandler) private readonly handlers: Array<EventHandler<Event>> = new Array<EventHandler<Event>>(),
    @inject(TYPES.Logger) private readonly logger: Logger
  ) {
  }

  public async dispatch (event: Event): Promise<void> {
    for (const handler of this.handlers) {
      if (handler.supports(event)) {
        this.logger.info(`Handling event ${event.constructor.name} with handler ${handler.constructor.name}`)
        try {
          await handler.handle(event)
        } catch (error: any) {
          this.logger.error(`Error occurred while handling event ${event.constructor.name} with handler ${handler.constructor.name}`, {
            error_message: error.message,
            event_name: event.constructor.name,
            handler_name: handler.constructor.name,
            error,
            event
          })
        }
      }
    }
  }
}
