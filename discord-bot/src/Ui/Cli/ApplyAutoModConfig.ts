import { readFile } from 'node:fs/promises';
import { inject, injectable } from 'inversify';
import type { ConsoleCommand } from '../../Domain/Console/ConsoleCommand.ts';
import type { AutoModClient } from '../../Domain/Community/AutoModClient.ts';
import { parseAutoModConfig } from '../../Domain/Moderation/AutoModConfigParser.ts';
import { buildRulePlan } from '../../Domain/Moderation/AutoModPlan.ts';
import { buildCommandsOnlyChannelPlan } from '../../Domain/Moderation/ChannelPermissionPlan.ts';
import { TYPES } from '../../Infrastructure/DependencyInjection/types.ts';
import type Logger from '../../Application/Logger/Logger.ts';

export const DEFAULT_AUTOMOD_CONFIG_PATH = 'config/automod-rules.json';

/**
 * `automod:apply` (M9.1) — the operator-run entry point for the checked-in
 * AutoMod rule file and "commands only" channel permissions.
 *
 * Deliberately **not** a scheduled `Job` (M6.1's runner) and **not**
 * something wired into boot: applying guild-wide moderation config
 * automatically, on every deploy, is exactly the kind of thing that turns a
 * typo'd rule file into an unreviewed, instant, guild-wide change. This is a
 * manual console command an operator runs on purpose, the same shape as
 * `trophies:fix-old` (M7.7) — see `FixOldTrophies.ts`.
 *
 * Safe-by-default, the opposite way round from most of this repo's
 * `--dry-run` flags: **no flag at all means dry-run.** Real reconciliation
 * requires an explicit `--apply`. That is the one non-negotiable from the
 * M9.1 work item — "an accidental run must not be able to silently widen or
 * wipe the guild's moderation" — an operator who runs this bare, or a CI
 * step that runs it by mistake, gets a config validation + preview and
 * touches nothing.
 *
 * Dry-run makes **zero** Discord API calls: it only reads and validates the
 * local file. It cannot show a real diff against the live guild (that needs
 * a read call), so it prints the fully-resolved desired state instead and
 * says so explicitly, rather than pretending to be a diff it isn't.
 *
 * Reconciliation (`--apply`) is scoped to rules this repo created — see
 * `Domain/Moderation/ManagedName.ts` — and never deletes a managed rule that
 * dropped out of the file unless `--prune-orphaned` is also passed; without
 * it, an orphaned managed rule is only reported. A rule made by hand in the
 * Discord UI is never read, written or deleted by this command at all.
 *
 * Usage (via `bun run:command`, see package.json):
 *   bun run:command automod:apply                          # dry-run (default), config-only preview
 *   bun run:command automod:apply --apply                  # reconcile managed rules + commands-only channels
 *   bun run:command automod:apply --apply --prune-orphaned  # also delete managed rules removed from the file
 *   bun run:command automod:apply --file=config/automod-rules.json [--apply]
 */
@injectable()
export default class ApplyAutoModConfig implements ConsoleCommand {
    public static commandName = 'automod:apply';

    constructor(
        @inject(TYPES.AutoModClient) private readonly autoModClient: AutoModClient,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {}

    configureArgs(_inputArgs: unknown): void {}

    public async run(inputArgs: unknown): Promise<number> {
        const args: string[] = Array.isArray(inputArgs) ? inputArgs.map(String) : [];
        const apply = args.includes('--apply');
        const pruneOrphaned = args.includes('--prune-orphaned');
        const fileFlag = args.find((arg) => arg.startsWith('--file='));
        const filePath = fileFlag
            ? fileFlag.split('=').slice(1).join('=')
            : DEFAULT_AUTOMOD_CONFIG_PATH;

        let raw: unknown;
        try {
            const contents = await readFile(filePath, 'utf-8');
            raw = JSON.parse(contents);
        } catch (error) {
            this.logger.error('automod:apply.read-failed', {
                filePath,
                error: (error as Error).message,
            });
            return 1;
        }

        const { config, errors } = parseAutoModConfig(raw);
        if (!config) {
            // Rejected outright — nothing below this point ever runs, so a
            // bad rule can never be half-applied while the rest goes through.
            this.logger.error('automod:apply.invalid-config', { filePath, errors });
            return 1;
        }

        if (!apply) {
            this.logger.info('automod:apply.dry-run', {
                filePath,
                note:
                    'Config parsed and validated. No Discord API calls were made, so this is the ' +
                    'desired state only, not a diff against the live guild. Re-run with --apply to reconcile.',
                rules: config.rules.map((rule) => ({
                    key: rule.key,
                    displayName: rule.displayName,
                    enabled: rule.enabled,
                    triggerType: rule.triggerType,
                })),
                commandsOnlyChannels: config.commandsOnlyChannels.map(
                    (channel) => channel.channelId,
                ),
            });
            return 0;
        }

        let failed = 0;

        const remoteRules = await this.autoModClient.listRules();
        const rulePlan = buildRulePlan(config.rules, remoteRules);

        for (const definition of rulePlan.toCreate) {
            try {
                await this.autoModClient.createRule(definition);
                this.logger.info('automod:apply.rule-created', { key: definition.key });
            } catch (error) {
                failed++;
                this.logger.error('automod:apply.rule-create-failed', {
                    key: definition.key,
                    error: (error as Error).message,
                });
            }
        }

        for (const { definition, remoteId } of rulePlan.toUpdate) {
            try {
                await this.autoModClient.updateRule(remoteId, definition);
                this.logger.info('automod:apply.rule-updated', { key: definition.key, remoteId });
            } catch (error) {
                failed++;
                this.logger.error('automod:apply.rule-update-failed', {
                    key: definition.key,
                    remoteId,
                    error: (error as Error).message,
                });
            }
        }

        for (const { definition, remoteId } of rulePlan.toRecreate) {
            try {
                // triggerType is immutable server-side — PATCH cannot change
                // it, so this is delete-then-create rather than an update.
                await this.autoModClient.deleteRule(remoteId);
                await this.autoModClient.createRule(definition);
                this.logger.info('automod:apply.rule-recreated', { key: definition.key, remoteId });
            } catch (error) {
                failed++;
                this.logger.error('automod:apply.rule-recreate-failed', {
                    key: definition.key,
                    remoteId,
                    error: (error as Error).message,
                });
            }
        }

        for (const remote of rulePlan.orphanedManaged) {
            if (!pruneOrphaned) {
                this.logger.warn('automod:apply.rule-orphaned', {
                    remoteId: remote.id,
                    name: remote.name,
                    note: 'Managed rule no longer in the file. Left untouched — pass --prune-orphaned to delete it.',
                });
                continue;
            }
            try {
                await this.autoModClient.deleteRule(remote.id);
                this.logger.info('automod:apply.rule-pruned', {
                    remoteId: remote.id,
                    name: remote.name,
                });
            } catch (error) {
                failed++;
                this.logger.error('automod:apply.rule-prune-failed', {
                    remoteId: remote.id,
                    error: (error as Error).message,
                });
            }
        }

        let channelsChanged = 0;
        for (const channel of config.commandsOnlyChannels) {
            try {
                const current = await this.autoModClient.getEveryoneChannelOverwrite(
                    channel.channelId,
                );
                const plan = buildCommandsOnlyChannelPlan(channel.channelId, current);
                if (!plan.changed) {
                    continue;
                }
                await this.autoModClient.putEveryoneChannelOverwrite(
                    channel.channelId,
                    plan.desired,
                );
                channelsChanged++;
                this.logger.info('automod:apply.channel-updated', { channelId: channel.channelId });
            } catch (error) {
                failed++;
                this.logger.error('automod:apply.channel-update-failed', {
                    channelId: channel.channelId,
                    error: (error as Error).message,
                });
            }
        }

        this.logger.info('automod:apply.finish', {
            created: rulePlan.toCreate.length,
            updated: rulePlan.toUpdate.length,
            recreated: rulePlan.toRecreate.length,
            unchanged: rulePlan.unchanged.length,
            orphanedManaged: rulePlan.orphanedManaged.length,
            pruned: pruneOrphaned ? rulePlan.orphanedManaged.length : 0,
            channelsChanged,
            failed,
        });

        return failed > 0 ? 1 : 0;
    }
}
