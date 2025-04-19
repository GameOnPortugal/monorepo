import {myContainer} from "./Infrastructure/DependencyInjection/inversify.config";
import type {Bot} from "./Domain/Bot/Bot.ts";
import type Logger from "./Application/Logger/Logger";
import {TYPES} from "./Infrastructure/DependencyInjection/types.ts";

const logger = myContainer.get<Logger>(TYPES.Logger);
const app = myContainer.get<Bot>(TYPES.Bot);

// eslint-disable-next-line @typescript-eslint/no-floating-promises -- cuz we want it this way
(async () => {
    try {
        await app.start();
        logger.info('⚡️ Discord Bot app is running!');
    } catch (error) {
        logger.error('Error starting app:', {error});
    }
})();
