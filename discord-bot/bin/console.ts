import { myContainer } from '../src/Infrastructure/DependencyInjection/inversify.config';
import { type ConsoleCommand } from '../src/Domain/Console/ConsoleCommand';
import { TYPES } from '../src/Infrastructure/DependencyInjection/types';
import type Logger from '../src/Application/Logger/Logger';
import WeekScreenshotWinner from '../src/Ui/Cli/WeekScreenshotWinner.ts';
import { RunJobConsoleCommand } from '../src/Infrastructure/Job/RunJobConsoleCommand.ts';
import FixOldTrophies from '../src/Ui/Cli/FixOldTrophies.ts';
import ApplyAutoModConfig from '../src/Ui/Cli/ApplyAutoModConfig.ts';
import TrophiesCatchUpAnnounce from '../src/Ui/Cli/TrophiesCatchUpAnnounce.ts';

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
// M9.1 — manual AutoMod config reconciliation, dry-run by default (see ApplyAutoModConfig.ts).
consoleCommands[ApplyAutoModConfig.commandName] =
    myContainer.get<ApplyAutoModConfig>(ApplyAutoModConfig);
// One-off "the trophy hall is alive again" post after a backfill — previews
// by default, posts only with --post (see TrophiesCatchUpAnnounce.ts).
consoleCommands[TrophiesCatchUpAnnounce.commandName] =
    myContainer.get<TrophiesCatchUpAnnounce>(TrophiesCatchUpAnnounce);

async function run(): Promise<number> {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        throw new Error('Missing command to run! Run "help" to see the available commands');
    }

    const commandArgs = args.slice(1);
    const action = args[0];

    if (!action || action === 'help') {
        console.log('Available commands:');
        console.log(Object.keys(consoleCommands).join('\n'));
        return 0;
    }

    if (!(action in consoleCommands)) {
        throw new Error(`Unknown action: ${action}`);
    }

    return (await consoleCommands[action]?.run(commandArgs)) ?? 0;
}

run()
    .then((exitCode) => {
        logger.info('Done!');
        process.exit(exitCode);
    })
    .catch((error: any) => {
        logger.error(`Error: ${error.message}`, { error });
        process.exit(1);
    });
