import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

/**
 * Tests the M6.9 migration
 * (`prisma/migrations/20260823130000_active_ad_expiry_backfill`) — the
 * data-only UPDATE that gives every `active` ad a deadline so
 * `ads:lifecycle`'s backstop has something to act on.
 *
 * Same strategy, and same reasoning, as `AdLifecycleMigration.test.ts`: this
 * is hand-written SQL that `prisma migrate diff` could never generate, its
 * whole substance is a WHERE clause, and getting that clause wrong is
 * silent — too broad and it hands `pending_renewal` rows 30 extra days they
 * were never granted, too narrow and the rows this fix exists for stay
 * invisible to the sweep. A schema assertion catches neither.
 */

const MIGRATIONS_DIR = join(import.meta.dir, '..', '..', '..', '..', 'prisma', 'migrations');

const baseUrl = () => {
    const url = process.env.DATABASE_URL;
    if (!url) {
        throw new Error('DATABASE_URL is not set');
    }
    return new URL(url);
};

const scratchDatabaseName = 'gop_ad_expiry_backfill_migration_test';

const urlForDatabase = (name: string): string => {
    const url = baseUrl();
    url.pathname = `/${name}`;
    return url.toString();
};

/** Splits a migration.sql file into individual statements and runs each one. */
const runMigrationFile = async (client: PrismaClient, migrationName: string): Promise<void> => {
    const sql = readFileSync(join(MIGRATIONS_DIR, migrationName, 'migration.sql'), 'utf-8');

    const statements = sql
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .split(';')
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0);

    for (const statement of statements) {
        await client.$executeRawUnsafe(statement);
    }
};

const DAY_MS = 24 * 60 * 60 * 1000;

describe('M6.9 active-ad expiry backfill migration', () => {
    let adminClient: PrismaClient;
    let scratchClient: PrismaClient;

    // Seeded before the migration runs; each id is asserted on afterwards.
    const ids = {
        activeNoBump: randomUUID(),
        activeBumped: randomUUID(),
        activeAlreadySet: randomUUID(),
        pendingRenewal: randomUUID(),
        expired: randomUUID(),
        softDeleted: randomUUID(),
    };

    // A fixed clock for the fixtures, so the assertions are exact arithmetic
    // rather than "roughly 30 days from whenever the test ran".
    const createdAt = new Date('2026-01-10T09:00:00Z');
    const bumpedAt = new Date('2026-03-01T09:00:00Z');
    const pendingDeadline = new Date('2026-08-24T09:00:00Z');

    beforeAll(async () => {
        adminClient = new PrismaClient({ adapter: new PrismaMariaDb(baseUrl().toString()) });
        await adminClient.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${scratchDatabaseName}\``);
        await adminClient.$executeRawUnsafe(`CREATE DATABASE \`${scratchDatabaseName}\``);

        scratchClient = new PrismaClient({
            adapter: new PrismaMariaDb(urlForDatabase(scratchDatabaseName)),
        });

        // Replay history up to the shape this migration expects. The three
        // migrations after M5.3 (job_runs, drop_dead_models, privacy
        // settings) never touch `ads`, so they are not needed here.
        await runMigrationFile(scratchClient, '20250416170150_init');
        await runMigrationFile(scratchClient, '20250416170855_image_as_text');
        await runMigrationFile(scratchClient, '20260820000000_ad_lifecycle');

        // M5.3 backfills `expires_at` for everything it finds, so clear it
        // first: the rows this migration is for are the ones written *after*
        // that migration, which land with a NULL.
        await scratchClient.$executeRawUnsafe('UPDATE `ads` SET `expires_at` = NULL');

        const insert = async (
            id: string,
            status: string,
            bumped: Date | null,
            expires: Date | null,
            deleted: Date | null,
        ) => {
            await scratchClient.$executeRawUnsafe(
                'INSERT INTO `ads` (`id`, `name`, `author_id`, `adType`, `status`, `createdAt`, `updatedAt`, `bumped_at`, `expires_at`, `deleted_at`) ' +
                    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                id,
                'Backfill fixture',
                '111122223333444455',
                'sell',
                status,
                createdAt,
                createdAt,
                bumped,
                expires,
                deleted,
            );
        };

        await insert(ids.activeNoBump, 'active', null, null, null);
        await insert(ids.activeBumped, 'active', bumpedAt, null, null);
        // Already has a deadline — must not be moved.
        await insert(ids.activeAlreadySet, 'active', null, pendingDeadline, null);
        // A 72h reply deadline; overwriting it would silently grant 30 more
        // days to someone already asked to answer within three.
        await insert(ids.pendingRenewal, 'pending_renewal', null, pendingDeadline, null);
        await insert(ids.expired, 'expired', null, null, null);
        await insert(ids.softDeleted, 'active', null, null, createdAt);

        await runMigrationFile(scratchClient, '20260823130000_active_ad_expiry_backfill');
    });

    afterAll(async () => {
        await scratchClient?.$disconnect();
        await adminClient.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${scratchDatabaseName}\``);
        await adminClient.$disconnect();
    });

    const expiresAtFor = async (id: string): Promise<Date | null> => {
        const rows = await scratchClient.$queryRawUnsafe<Array<{ expires_at: Date | null }>>(
            'SELECT `expires_at` FROM `ads` WHERE `id` = ?',
            id,
        );
        const row = rows[0];
        if (!row) {
            throw new Error(`No row found for id ${id}`);
        }
        return row.expires_at;
    };

    test('an active ad that was never bumped gets createdAt + 30 days', async () => {
        expect(await expiresAtFor(ids.activeNoBump)).toEqual(
            new Date(createdAt.getTime() + 30 * DAY_MS),
        );
    });

    test('an active ad that was bumped is measured from the bump, not creation', async () => {
        // The window runs from the last sign of life. Measuring from
        // `createdAt` would expire an ad someone bumped last week.
        expect(await expiresAtFor(ids.activeBumped)).toEqual(
            new Date(bumpedAt.getTime() + 30 * DAY_MS),
        );
    });

    test('a row that is already past due stays past due — it is not handed a fresh window', async () => {
        // The whole point: measured from the last activity rather than from
        // "now", so a long-idle row is already overdue and the very next
        // `ads:lifecycle` run expires it.
        const backfilled = await expiresAtFor(ids.activeNoBump);
        expect(backfilled!.getTime()).toBeLessThan(new Date('2026-08-23T00:00:00Z').getTime());
    });

    test('an active ad that already has a deadline is left exactly where it was', async () => {
        expect(await expiresAtFor(ids.activeAlreadySet)).toEqual(pendingDeadline);
    });

    test('a pending_renewal reply deadline is never overwritten', async () => {
        expect(await expiresAtFor(ids.pendingRenewal)).toEqual(pendingDeadline);
    });

    test('finished rows (expired, soft-deleted) are left NULL — their timestamps are history, not a schedule', async () => {
        expect(await expiresAtFor(ids.expired)).toBeNull();
        expect(await expiresAtFor(ids.softDeleted)).toBeNull();
    });
});
