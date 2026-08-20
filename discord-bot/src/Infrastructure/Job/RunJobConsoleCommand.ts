import { inject, injectable } from 'inversify';
import type { ConsoleCommand } from '../../Domain/Console/ConsoleCommand.ts';
import { JobRunner } from './JobRunner.ts';
import { TYPES } from '../DependencyInjection/types.ts';
import type Logger from '../../Application/Logger/Logger.ts';

/**
 * The manual entry point for any job registered with the JobRunner (M6.1) —
 * keeps `bin/console.ts` true to its role as "any job can also be run by
 * hand", without every job needing its own bespoke console command.
 *
 * Usage (via `bun run:command`, see package.json):
 *   bun run:command jobs:run list
 *   bun run:command jobs:run <job-name> [--dry-run] [--limit=N]
 */
@injectable()
export class RunJobConsoleCommand implements ConsoleCommand {
    public static commandName = 'jobs:run';

    constructor(
        @inject(JobRunner) private readonly jobRunner: JobRunner,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {}

    configureArgs(_inputArgs: any): void {}

    public async run(inputArgs: any): Promise<number> {
        const args: string[] = Array.isArray(inputArgs) ? inputArgs : [];
        const [jobName, ...flags] = args;

        if (!jobName || jobName === 'list') {
            this.logger.info('Registered jobs', { jobs: this.jobRunner.listJobs() });
            return 0;
        }

        const dryRun = flags.includes('--dry-run');
        const limitFlag = flags.find((flag) => flag.startsWith('--limit='));
        const workLimit = limitFlag ? Number(limitFlag.split('=')[1]) : undefined;

        const result = await this.jobRunner.runNow(jobName, { dryRun, workLimit });

        this.logger.info('Job finished', { job: jobName, dryRun, ...result });

        return result.failed > 0 ? 1 : 0;
    }
}
