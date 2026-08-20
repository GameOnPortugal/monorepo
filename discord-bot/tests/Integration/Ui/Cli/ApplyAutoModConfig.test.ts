import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ApplyAutoModConfig from '../../../../src/Ui/Cli/ApplyAutoModConfig.ts';
import { InMemoryAutoModClient } from '../../../../src/Infrastructure/Community/InMemory/InMemoryAutoModClient.ts';
import Logger from '../../../../src/Application/Logger/Logger.ts';
import InMemoryLogger from '../../../Helper/InMemoryLogger';
import { buildManagedRuleName } from '../../../../src/Domain/Moderation/ManagedName.ts';
import { buildCommandsOnlyChannelPlan } from '../../../../src/Domain/Moderation/ChannelPermissionPlan.ts';

/**
 * M9.1 — `automod:apply`. No test here (or anywhere in this suite) makes a
 * real Discord API call: `InMemoryAutoModClient` is the hand-rolled fake
 * (Infrastructure/Community/InMemory/InMemoryAutoModClient.ts), the same
 * pattern the repo already uses for `GuildClient` (`InMemoryGuildClient`) —
 * bound automatically when there is no Discord token and reused directly by
 * tests, rather than a mocking library.
 */
describe('ApplyAutoModConfig', () => {
    let autoModClient: InMemoryAutoModClient;
    let logger: InMemoryLogger;
    let command: ApplyAutoModConfig;
    let dir: string;

    beforeEach(async () => {
        autoModClient = new InMemoryAutoModClient();
        logger = new InMemoryLogger();
        command = new ApplyAutoModConfig(autoModClient, new Logger([logger]));
        dir = await mkdtemp(join(tmpdir(), 'automod-test-'));
    });

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    async function writeConfig(contents: unknown): Promise<string> {
        const filePath = join(dir, 'automod-rules.json');
        await writeFile(filePath, JSON.stringify(contents), 'utf-8');
        return filePath;
    }

    const validRule = (overrides: Record<string, unknown> = {}) => ({
        key: 'starter-keyword-blocklist',
        displayName: 'Starter keyword blocklist',
        enabled: false,
        eventType: 'MESSAGE_SEND',
        triggerType: 'KEYWORD',
        keywordFilter: ['examplebadword'],
        regexPatterns: [],
        allowList: [],
        presets: [],
        exemptRoles: [],
        exemptChannels: [],
        actions: [{ type: 'BLOCK_MESSAGE', customMessage: 'Blocked.' }],
        ...overrides,
    });

    test('an invalid file is rejected with a useful message and makes zero API calls, even in --apply mode', async () => {
        const filePath = await writeConfig({ rules: [{ key: 'bad' }] });

        const exitCode = await command.run([`--file=${filePath}`, '--apply']);

        expect(exitCode).toBe(1);
        expect(autoModClient.calls).toEqual([]);
        expect(logger.hasLog('error', 'automod:apply.invalid-config')).toBe(true);
        const errorLog = logger.logs.find((log) => log.message === 'automod:apply.invalid-config');
        expect(Array.isArray(errorLog?.errors)).toBe(true);
        expect((errorLog?.errors as string[]).length).toBeGreaterThan(0);
    });

    test('a missing file is reported cleanly, not as a stack trace, and makes zero API calls', async () => {
        const exitCode = await command.run([`--file=${join(dir, 'does-not-exist.json')}`]);

        expect(exitCode).toBe(1);
        expect(autoModClient.calls).toEqual([]);
        expect(logger.hasLog('error', 'automod:apply.read-failed')).toBe(true);
    });

    test('dry-run (no --apply flag) makes zero Discord API calls', async () => {
        const filePath = await writeConfig({ rules: [validRule()], commandsOnlyChannels: [] });

        const exitCode = await command.run([`--file=${filePath}`]);

        expect(exitCode).toBe(0);
        expect(autoModClient.calls).toEqual([]);
        expect(logger.hasLog('info', 'automod:apply.dry-run')).toBe(true);
    });

    test('dry-run is also the default with no flags at all — bare invocation never touches the API', async () => {
        const filePath = await writeConfig({ rules: [validRule()] });

        const exitCode = await command.run([`--file=${filePath}`]);

        expect(exitCode).toBe(0);
        expect(autoModClient.calls).toEqual([]);
    });

    test('--apply on an empty guild creates the rules in the file', async () => {
        const filePath = await writeConfig({ rules: [validRule()], commandsOnlyChannels: [] });

        const exitCode = await command.run([`--file=${filePath}`, '--apply']);

        expect(exitCode).toBe(0);
        const rules = await autoModClient.listRules();
        expect(rules).toHaveLength(1);
        expect(rules[0]?.name).toBe(
            buildManagedRuleName('starter-keyword-blocklist', 'Starter keyword blocklist'),
        );
    });

    test('reconciliation never touches a rule made by hand in the Discord UI', async () => {
        const handMade = autoModClient.seedUnmanagedRule('#anuncios rules — made by a moderator');
        const filePath = await writeConfig({ rules: [validRule()], commandsOnlyChannels: [] });

        const exitCode = await command.run([`--file=${filePath}`, '--apply']);

        expect(exitCode).toBe(0);
        const rules = await autoModClient.listRules();
        const stillThere = rules.find((rule) => rule.id === handMade.id);
        expect(stillThere).toEqual(handMade);
        // And the managed rule from the file was created alongside it.
        expect(rules).toHaveLength(2);
    });

    test('a managed rule already matching the file is left unchanged — no update call', async () => {
        const definition = validRule();
        await autoModClient.createRule(definition as any);
        autoModClient.calls.length = 0; // clear the create call from setup
        const filePath = await writeConfig({ rules: [definition], commandsOnlyChannels: [] });

        const exitCode = await command.run([`--file=${filePath}`, '--apply']);

        expect(exitCode).toBe(0);
        expect(autoModClient.calls).toEqual(['listRules']); // read-only: no create/update call
    });

    test('a managed rule removed from the file is reported as orphaned but not deleted without --prune-orphaned', async () => {
        const definition = validRule();
        const created = await autoModClient.createRule(definition as any);
        autoModClient.calls.length = 0;
        const filePath = await writeConfig({ rules: [], commandsOnlyChannels: [] });

        const exitCode = await command.run([`--file=${filePath}`, '--apply']);

        expect(exitCode).toBe(0);
        const rules = await autoModClient.listRules();
        expect(rules.map((rule) => rule.id)).toContain(created.id);
        expect(logger.hasLog('warn', 'automod:apply.rule-orphaned')).toBe(true);
    });

    test('--prune-orphaned deletes a managed rule removed from the file', async () => {
        const definition = validRule();
        const created = await autoModClient.createRule(definition as any);
        const filePath = await writeConfig({ rules: [], commandsOnlyChannels: [] });

        const exitCode = await command.run([`--file=${filePath}`, '--apply', '--prune-orphaned']);

        expect(exitCode).toBe(0);
        const rules = await autoModClient.listRules();
        expect(rules.map((rule) => rule.id)).not.toContain(created.id);
    });

    test('a commands-only channel with no existing overwrite gets one created', async () => {
        const filePath = await writeConfig({
            rules: [],
            commandsOnlyChannels: [{ channelId: '818108848492773377' }],
        });

        const exitCode = await command.run([`--file=${filePath}`, '--apply']);

        expect(exitCode).toBe(0);
        const overwrite = await autoModClient.getEveryoneChannelOverwrite('818108848492773377');
        expect(overwrite).not.toBeNull();
    });

    test('a commands-only channel already correctly configured is skipped — no put call', async () => {
        // Pre-seed the exact desired end state directly.
        const desired = buildCommandsOnlyChannelPlan('818108848492773377', null).desired;
        autoModClient.seedChannelOverwrite('818108848492773377', desired);
        const filePath = await writeConfig({
            rules: [],
            commandsOnlyChannels: [{ channelId: '818108848492773377' }],
        });

        const exitCode = await command.run([`--file=${filePath}`, '--apply']);

        expect(exitCode).toBe(0);
        expect(autoModClient.calls).toEqual([
            'listRules',
            'getEveryoneChannelOverwrite:818108848492773377',
        ]);
    });
});
