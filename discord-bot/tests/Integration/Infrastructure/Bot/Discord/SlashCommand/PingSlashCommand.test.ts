import { describe, test, expect } from 'bun:test';
import { PingSlashCommand } from '../../../../../../src/Infrastructure/Bot/Discord/SlashCommand/PingSlashCommand';

/**
 * M1.10/M4.3: every top-level command must be guild-only (setContexts) and
 * declare its member-permission default explicitly (setDefaultMemberPermissions).
 * `/ping` is not admin-gated, so the default is explicitly `null` (open to
 * everyone) rather than left implicit.
 */
describe('PingSlashCommand builder()', () => {
    test('is guild-only, guild-install, and explicitly open to every member', () => {
        const command = new PingSlashCommand({} as any);

        const json = command.builder().toJSON();

        expect(json.contexts).toEqual([0]); // InteractionContextType.Guild
        expect(json.integration_types).toEqual([0]); // ApplicationIntegrationType.GuildInstall
        expect(json.default_member_permissions).toBeNull();
    });
});
