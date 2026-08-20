import { describe, expect, it } from 'bun:test';

/**
 * The gate that was missing when the bot crash-looped in production on
 * `No bindings found for service: "Symbol(MediaStorage)"`.
 *
 * `inversify.config.ts` takes a *different branch* when `DISCORD_TOKEN` and
 * `DISCORD_CLIENT_ID` are set: it binds `DiscordBot`/`DiscordGuildClient`
 * instead of the in-memory stand-ins. The whole test suite runs without a
 * token on purpose — that absence is what keeps tests off the network — so
 * until this file existed, **the branch that production actually takes was
 * never executed by anything**. A binding graph that resolved cleanly in CI
 * could still be unresolvable at boot, and was.
 *
 * This has to run in a subprocess. The container is a module-level singleton
 * built at import time from `process.env`, so it cannot be re-created with
 * different env inside a test that has already imported it — and `bun test`
 * shares one module registry across the file. Spawning is not a workaround
 * here; booting the container in a fresh process with production-shaped env
 * *is* the thing under test.
 *
 * The token is a syntactically-plausible fake. Nothing in this path talks to
 * Discord: `DiscordGuildClient` builds a REST client without logging in, and
 * `DiscordBot`'s constructor only configures a client — `login()` happens in
 * `start()`, which is never called here.
 */

const FAKE_CLIENT_ID = '123456789012345678';

/**
 * Assembled from parts rather than written as a literal. A Discord bot token
 * is `base64(clientId).<timestamp>.<hmac>`, and a realistic-looking literal
 * matches GitHub's secret-scanning pattern well enough that push protection
 * rejects the commit — correctly, since it cannot know a token is fake. This
 * still produces the right *shape*, which is all `validateBotEnv()` and the
 * REST client care about, without tripping the scanner.
 */
const FAKE_TOKEN = [
    Buffer.from(FAKE_CLIENT_ID).toString('base64').replace(/=+$/, ''),
    'A'.repeat(6),
    'B'.repeat(27),
].join('.');

async function bootContainerWithBotEnv(script: string): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
}> {
    const proc = Bun.spawn(['bun', '-e', script], {
        cwd: `${import.meta.dir}/../../../..`,
        env: {
            ...process.env,
            DISCORD_TOKEN: FAKE_TOKEN,
            DISCORD_CLIENT_ID: FAKE_CLIENT_ID,
            // Explicitly unset: DISCORD_DEV_GUILD_ID must not leak in from a
            // developer's shell and change which registration branch runs.
            DISCORD_DEV_GUILD_ID: undefined,
        },
        stdout: 'pipe',
        stderr: 'pipe',
    });

    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
    ]);

    return { exitCode, stdout, stderr };
}

describe('Container boot with a Discord token (the production branch)', () => {
    it('resolves TYPES.Bot to a real DiscordBot, with every transitive binding present', async () => {
        const { exitCode, stdout, stderr } = await bootContainerWithBotEnv(`
            const { myContainer } = await import('./src/Infrastructure/DependencyInjection/inversify.config.ts');
            const { TYPES } = await import('./src/Infrastructure/DependencyInjection/types.ts');
            console.log('BOT=' + myContainer.get(TYPES.Bot).constructor.name);
        `);

        // The failure this guards against surfaces as "No bindings found for
        // service: Symbol(<whatever was bound too late)", so assert on the
        // output rather than only on the exit code — it is the message that
        // tells the next person which binding moved.
        expect(`${stdout}${stderr}`).not.toContain('No bindings found');
        expect(exitCode).toBe(0);
        expect(stdout).toContain('BOT=DiscordBot');
    }, 60_000);

    it('resolves every slash command, component and autocomplete handler through BotExecutor', async () => {
        // BotExecutor is what the eager `myContainer.get()` used to pull in,
        // and it is the widest fan-out in the graph: every SlashCommandHandler
        // -> subcommand -> CommandHandlerManager -> every TYPES.CommandHandler.
        // Resolving it is the cheapest way to prove the whole application
        // layer is bindable.
        const { exitCode, stdout, stderr } = await bootContainerWithBotEnv(`
            const { myContainer } = await import('./src/Infrastructure/DependencyInjection/inversify.config.ts');
            const { BotExecutor } = await import('./src/Infrastructure/Bot/BotExecutor.ts');
            const executor = myContainer.get(BotExecutor);
            console.log('COMMANDS=' + executor.getCommandNames().sort().join(','));
            console.log('AUTOCOMPLETE=' + executor.autocompleteHandlers.length);
        `);

        expect(`${stdout}${stderr}`).not.toContain('No bindings found');
        expect(exitCode).toBe(0);
        expect(stdout).toContain('COMMANDS=marketplace,ping,screenshot,trophy');
        // Loose assertion on purpose: adding an autocomplete handler should
        // not fail this test, but removing all of them should.
        expect(stdout).not.toContain('AUTOCOMPLETE=0');
    }, 60_000);

    it('resolves the job runner and every registered job', async () => {
        // The scheduler path is resolved from bin/console.ts, which has no
        // Discord token — but it shares this container, and a job that needs
        // a late-bound service would fail the same way.
        const { exitCode, stdout, stderr } = await bootContainerWithBotEnv(`
            const { myContainer } = await import('./src/Infrastructure/DependencyInjection/inversify.config.ts');
            const { JobRunner } = await import('./src/Infrastructure/Job/JobRunner.ts');
            myContainer.get(JobRunner);
            console.log('JOBS_OK');
        `);

        expect(`${stdout}${stderr}`).not.toContain('No bindings found');
        expect(exitCode).toBe(0);
        expect(stdout).toContain('JOBS_OK');
    }, 60_000);
});
