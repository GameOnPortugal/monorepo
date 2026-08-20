import { describe, test, expect } from 'bun:test';
import Logger from '../../../../../../../src/Application/Logger/Logger';
import InMemoryLogger from '../../../../../../Helper/InMemoryLogger';
import { TrophySlashCommand } from '../../../../../../../src/Infrastructure/Bot/Discord/SlashCommand/Trophy/TrophySlashCommand';

/**
 * M1.10/M4.3: every top-level command must be guild-only (setContexts) and
 * declare its member-permission default explicitly. `/trophy` has no
 * admin-only subcommand today, so the default is explicitly `null` (open to
 * everyone) rather than left implicit.
 */
describe('TrophySlashCommand builder()', () => {
    test('is guild-only, guild-install, and explicitly open to every member', () => {
        const logger = new Logger([new InMemoryLogger()]);
        const command = new TrophySlashCommand(logger, {} as any, {} as any, {} as any);

        const json = command.builder().toJSON();

        expect(json.contexts).toEqual([0]); // InteractionContextType.Guild
        expect(json.integration_types).toEqual([0]); // ApplicationIntegrationType.GuildInstall
        expect(json.default_member_permissions).toBeNull();
    });
});
