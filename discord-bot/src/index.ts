import { myContainer } from './Infrastructure/DependencyInjection/inversify.config';
import type { Bot } from './Domain/Bot/Bot.ts';
import type Logger from './Application/Logger/Logger';
import { TYPES } from './Infrastructure/DependencyInjection/types.ts';
import { JobRunner } from './Infrastructure/Job/JobRunner.ts';

const logger = myContainer.get<Logger>(TYPES.Logger);
const app = myContainer.get<Bot>(TYPES.Bot);
const jobRunner = myContainer.get(JobRunner);

(async () => {
    try {
        await app.start();
        logger.info('⚡️ Discord Bot app is running!');
        await jobRunner.start();
    } catch (error) {
        logger.error('Error starting app:', { error });
    }
})();

// M6.1: stop scheduling new job runs and let anything in flight finish before
// exit. A parallel PR is adding broader SIGTERM handling to the bot lifecycle
// — this line is intentionally self-contained so it rebases trivially either way.
process.on('SIGTERM', () => void jobRunner.stop());
