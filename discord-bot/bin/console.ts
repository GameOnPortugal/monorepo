import { myContainer } from '../src/Infrastructure/DependencyInjection/inversify.config';
import { type ConsoleCommand } from '../src/Domain/Console/ConsoleCommand';
import { TYPES } from '../src/Infrastructure/DependencyInjection/types';
import type Logger from '../src/Application/Logger/Logger';
import WeekScreenshotWinner from '../src/Ui/Cli/WeekScreenshotWinner.ts';
import { RunJobConsoleCommand } from '../src/Infrastructure/Job/RunJobConsoleCommand.ts';
import FixOldTrophies from '../src/Ui/Cli/FixOldTrophies.ts';

const logger = myContainer.get<Logger>(TYPES.Logger);
const consoleCommands: Record<string, ConsoleCommand> = {};
consoleCommands[WeekScreenshotWinner.commandName.toString()] =
    myContainer.get<WeekScreenshotWinner>(WeekScreenshotWinner);
// M6.1 — generic manual entry point for any job registered with the
// JobRunner: `bun run:command jobs:run list` / `jobs:run <name> [--dry-run] [--limit=N]`.
consoleCommands[RunJobConsoleCommand.commandName] =
    myContainer.get<RunJobConsoleCommand>(RunJobConsoleCommand);
// M7.7 — one-off backfill, not a scheduled job (see FixOldTrophies.ts for why).
consoleCommands[FixOldTrophies.commandName] = myContainer.get<FixOldTrophies>(FixOldTrophies);

async function run(): Promise<void> {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        throw new Error('Missing command to run! Run "help" to see the available commands');
    }

    const commandArgs = args.slice(1);
    const action = args[0];

    if (!action || action === 'help') {
        console.log('Available commands:');
        console.log(Object.keys(consoleCommands).join('\n'));
        return;
    }

    if (!(action in consoleCommands)) {
        throw new Error(`Unknown action: ${action}`);
    }

    await consoleCommands[action]?.run(commandArgs);
}

run()
    .then(() => {
        logger.info('Done!');
        process.exit(0);
    })
    .catch((error: any) => {
        logger.error(`Error: ${error.message}`, { error });
        process.exit(1);
    });
