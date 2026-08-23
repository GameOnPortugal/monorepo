import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { myContainer } from '../../../../../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../../../../../src/Infrastructure/DependencyInjection/types';
import DatabaseUtil from '../../../../../Helper/DatabaseUtil';
import { SyncDiscordProfile } from '../../../../../../src/Application/Write/Profile/SyncDiscordProfile/SyncDiscordProfile.ts';
import {
    SyncDiscordProfileHandler,
    type ImageFetcher,
} from '../../../../../../src/Application/Write/Profile/SyncDiscordProfile/SyncDiscordProfileHandler.ts';
import type { DiscordProfileRepository } from '../../../../../../src/Domain/Profile/DiscordProfileRepository.ts';
import type { CommunityUser } from '../../../../../../src/Domain/Community/CommunityUser.ts';
import { InMemoryGuildClient } from '../../../../../../src/Infrastructure/Community/InMemory/InMemoryGuildClient.ts';
import { InMemoryMediaStorage } from '../../../../../../src/Infrastructure/Media/InMemoryMediaStorage.ts';
import Logger from '../../../../../../src/Application/Logger/Logger';
import InMemoryLogger from '../../../../../Helper/InMemoryLogger';

// A fabricated snowflake. Named AUTHOR_ID, not DISCORD_ID, deliberately:
// gitleaks' built-in `discord-client-id` rule fires on any 18-digit literal
// assigned to a variable whose name contains "discord", so the latter fails
// the repo's secret scan on a value that is not a secret at all. The sibling
// fixtures (`authorId`, `AUTHOR_A`) already use this convention.
const AUTHOR_ID = '999988887777666655';

/** Records every URL it was asked for, so "did this re-download?" is observable. */
class RecordingImageFetcher implements ImageFetcher {
    public calls: string[] = [];
    public failWith: Error | undefined;

    async fetch(url: string) {
        this.calls.push(url);
        if (this.failWith) throw this.failWith;
        return { bytes: new TextEncoder().encode(`avatar-${url}`), contentType: 'image/png' };
    }
}

/**
 * M10.4 — the handler behind every screenshot credit on the portal.
 *
 * The behaviour worth pinning is not "it writes a row" but the three things
 * that keep a nightly pass over 109 members cheap and honest: it re-hosts
 * rather than links, it does not re-download an unchanged picture, and a
 * failed picture never costs the community the name.
 */
describe('SyncDiscordProfileHandler', () => {
    let handler: SyncDiscordProfileHandler;
    let profileRepository: DiscordProfileRepository;
    let guildClient: InMemoryGuildClient;
    let mediaStorage: InMemoryMediaStorage;
    let imageFetcher: RecordingImageFetcher;
    let ormClient: PrismaClient;

    beforeEach(async () => {
        await DatabaseUtil.truncateAllTables();

        // The repository and the Prisma client come from the container (this
        // is an integration test against a real database); every collaborator
        // that would otherwise reach the network is a fake constructed here.
        // Rebinding them in the container would not work: CommandHandlerManager
        // resolves its handlers once, so a later rebind never reaches an
        // already-constructed handler — the real SafeImageFetcher would go on
        // calling Discord's CDN for real.
        profileRepository = myContainer.get<DiscordProfileRepository>(
            TYPES.DiscordProfileRepository,
        );
        ormClient = myContainer.get<PrismaClient>(TYPES.OrmClient);

        guildClient = new InMemoryGuildClient();
        mediaStorage = new InMemoryMediaStorage();
        imageFetcher = new RecordingImageFetcher();
        handler = new SyncDiscordProfileHandler(
            profileRepository,
            guildClient,
            mediaStorage,
            imageFetcher,
            new Logger([new InMemoryLogger()]),
        );
    });

    afterEach(async () => {
        await ormClient.$disconnect();
    });

    function sync(known?: CommunityUser) {
        return handler.handle(new SyncDiscordProfile(AUTHOR_ID, known));
    }

    test('re-hosts the avatar instead of storing a cdn.discordapp.com URL', async () => {
        guildClient.registerUser({
            id: AUTHOR_ID,
            username: 'luis',
            displayName: 'Luís',
            avatarHash: 'abc123',
        });

        const result = await sync();

        expect(result.avatarRehosted).toBe(true);
        expect(result.profile?.username).toBe('luis');
        expect(result.profile?.displayName).toBe('Luís');
        // Cross-cutting rule 3 / plan 09 decision 1: never the Discord CDN.
        expect(result.profile?.avatarUrl).not.toContain('discordapp.com');
        // And never the member's snowflake in a public URL — MediaKey.ts's
        // "no user IDs" rule, which is why the key is the avatar hash.
        expect(result.profile?.avatarUrl).not.toContain(AUTHOR_ID);
        expect(result.profile?.avatarUrl).toContain('abc123');
        expect(await mediaStorage.exists('avatars/abc123.png')).toBe(true);

        // The source it downloaded *from* is the CDN — that part is correct.
        expect(imageFetcher.calls[0]).toContain('cdn.discordapp.com');
    });

    test('a second sync with the same avatar hash does not download it again', async () => {
        guildClient.registerUser({
            id: AUTHOR_ID,
            username: 'luis',
            displayName: null,
            avatarHash: 'abc123',
        });

        const first = await sync();
        const second = await sync();

        expect(imageFetcher.calls).toHaveLength(1);
        expect(second.avatarRehosted).toBe(false);
        expect(second.profile?.avatarUrl).toBe(first.profile?.avatarUrl as string);
    });

    test('a changed avatar hash re-hosts under a new key, leaving the old object alone', async () => {
        guildClient.registerUser({
            id: AUTHOR_ID,
            username: 'luis',
            displayName: null,
            avatarHash: 'aaaa1111bbbb2222cccc3333dddd4444',
        });
        await sync();

        guildClient.registerUser({
            id: AUTHOR_ID,
            username: 'luis',
            displayName: null,
            avatarHash: 'eeee5555ffff6666aaaa7777bbbb8888',
        });
        const result = await sync();

        expect(result.avatarRehosted).toBe(true);
        expect(result.profile?.avatarHash).toBe('eeee5555ffff6666aaaa7777bbbb8888');
        expect(await mediaStorage.exists('avatars/eeee5555ffff6666aaaa7777bbbb8888.png')).toBe(
            true,
        );
        // Deliberately not swept — a page still holding the previous URL keeps working.
        expect(await mediaStorage.exists('avatars/aaaa1111bbbb2222cccc3333dddd4444.png')).toBe(
            true,
        );
    });

    test('removing a custom avatar clears the stored one rather than keeping a stale picture', async () => {
        guildClient.registerUser({
            id: AUTHOR_ID,
            username: 'luis',
            displayName: null,
            avatarHash: 'abc123',
        });
        await sync();

        guildClient.registerUser({
            id: AUTHOR_ID,
            username: 'luis',
            displayName: null,
            avatarHash: null,
        });
        const result = await sync();

        expect(result.profile?.avatarUrl).toBeNull();
        expect(result.profile?.avatarHash).toBeNull();
    });

    test('a failed avatar re-host still saves the name — the credit is the point', async () => {
        guildClient.registerUser({
            id: AUTHOR_ID,
            username: 'luis',
            displayName: 'Luís',
            avatarHash: 'abc123',
        });
        imageFetcher.failWith = new Error('CDN refused');

        const result = await sync();

        expect(result.profile?.username).toBe('luis');
        expect(result.profile?.avatarUrl).toBeNull();
        expect(await profileRepository.find(AUTHOR_ID)).not.toBeNull();
    });

    test('a deleted Discord account leaves an existing cached profile untouched', async () => {
        guildClient.registerUser({
            id: AUTHOR_ID,
            username: 'luis',
            displayName: 'Luís',
            avatarHash: 'abc123',
        });
        await sync();

        // Unregistering makes fetchUser answer null, the real client's
        // Unknown-User (10013) case.
        guildClient.reset();
        const result = await sync();

        expect(result.profile?.username).toBe('luis');
        expect(result.avatarRehosted).toBe(false);
    });

    test('the ingest path passes the identity it already has, saving a lookup', async () => {
        // Nothing registered on the guild client at all: if the handler
        // reached for Discord here it would find nobody and write nothing.
        const result = await sync({
            id: AUTHOR_ID,
            username: 'from-interaction',
            displayName: null,
            avatarHash: null,
        });

        expect(result.profile?.username).toBe('from-interaction');
    });

    test('preferredName falls back to the username when no display name is set', async () => {
        guildClient.registerUser({
            id: AUTHOR_ID,
            username: 'luis',
            displayName: null,
            avatarHash: null,
        });

        const result = await sync();

        expect(result.profile?.preferredName).toBe('luis');
    });
});
