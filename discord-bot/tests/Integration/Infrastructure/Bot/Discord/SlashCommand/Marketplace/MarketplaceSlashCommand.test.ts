import { describe, test, expect } from 'bun:test';
import Logger from '../../../../../../../src/Application/Logger/Logger';
import InMemoryLogger from '../../../../../../Helper/InMemoryLogger';
import { MarketplaceSlashCommand } from '../../../../../../../src/Infrastructure/Bot/Discord/SlashCommand/Marketplace/MarketplaceSlashCommand';

/**
 * M1.10/M4.3: every top-level command must be guild-only (setContexts) — the
 * real bug this fixes for `/marketplace` specifically is ListAdsSubcommand
 * building `https://discord.com/channels/${guildId}/...` links with
 * `guildId === null` when invoked from a DM. Member-permission default is
 * explicitly `null` (open to everyone): every subcommand today is usable by
 * regular members (sell/list/delete-your-own); the planned M5.10 admin
 * override is a per-invocation check inside the subcommand, not a change to
 * who can see this command.
 */
describe('MarketplaceSlashCommand builder()', () => {
    test('is guild-only, guild-install, and explicitly open to every member', () => {
        const logger = new Logger([new InMemoryLogger()]);
        const command = new MarketplaceSlashCommand(logger, {} as any, {} as any, {} as any);

        const json = command.builder().toJSON();

        expect(json.contexts).toEqual([0]); // InteractionContextType.Guild
        expect(json.integration_types).toEqual([0]); // ApplicationIntegrationType.GuildInstall
        expect(json.default_member_permissions).toBeNull();
    });
});
