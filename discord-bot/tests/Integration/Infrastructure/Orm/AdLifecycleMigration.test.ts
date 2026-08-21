import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

/**
 * Tests the M5.3 migration (`prisma/migrations/20260820000000_ad_lifecycle`)
 * against data shaped like the real, live `ads` table — not the ORM, not the
 * Domain layer, the actual migration SQL. This is deliberate: the task this
 * migration does (normalise `adType`, parse `price` into `price_cents`) is
 * SQL that `prisma migrate diff` cannot generate, so it is exactly the part
 * most likely to be subtly wrong, and the part a schema-level assertion would
 * not catch.
 *
 * Strategy: spin up a throwaway database, replay the two pre-existing
 * migrations to get the pre-M5.3 shape, seed rows shaped like production
 * (mixed adType, free-text prices in every format seen in the real column —
 * see the coordinator's production query, 2026-08-20), replay the M5.3
 * migration, then assert on the raw rows.
 */

const MIGRATIONS_DIR = join(import.meta.dir, '..', '..', '..', '..', 'prisma', 'migrations');

const baseUrl = () => {
    const url = process.env.DATABASE_URL;
    if (!url) {
        throw new Error('DATABASE_URL is not set');
    }
    return new URL(url);
};

const scratchDatabaseName = 'gop_ad_lifecycle_migration_test';

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

type LegacyAdRow = {
    id: string;
    adType: string | null;
    price: string | null;
};

describe('M5.3 ad lifecycle migration', () => {
    let adminClient: PrismaClient;
    let scratchClient: PrismaClient;
    const seeded: LegacyAdRow[] = [];

    beforeAll(async () => {
        // A client on the ordinary test database, used only to create/drop the
        // scratch database — DDL Prisma's own client can't target itself with.
        adminClient = new PrismaClient({ adapter: new PrismaMariaDb(baseUrl().toString()) });
        await adminClient.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${scratchDatabaseName}\``);
        await adminClient.$executeRawUnsafe(`CREATE DATABASE \`${scratchDatabaseName}\``);

        scratchClient = new PrismaClient({
            adapter: new PrismaMariaDb(urlForDatabase(scratchDatabaseName)),
        });

        // Replay history: the pre-M5.3 shape, then the migration under test.
        await runMigrationFile(scratchClient, '20250416170150_init');
        await runMigrationFile(scratchClient, '20250416170855_image_as_text');

        // Seed rows shaped like the real table (mixed adType, and every price
        // format confirmed present in production, plus a couple of edge cases:
        // NULL price, and formats deliberately not in the "must parse" set).
        const rows: Array<{ adType: string; price: string | null }> = [
            // adType coverage — 'sale' must normalise to 'sell'; 'sell' and
            // 'wanted' must pass through untouched.
            { adType: 'sale', price: '25' },
            { adType: 'sell', price: '65' },
            { adType: 'wanted', price: null },

            // Unambiguous prices that must parse (production sample).
            { adType: 'sale', price: '17,50€' },
            { adType: 'sale', price: '42,5€' },
            { adType: 'sale', price: '1' },
            { adType: 'sale', price: '26,99' },
            { adType: 'sale', price: '45€' },
            { adType: 'sale', price: '450,00€' },
            { adType: 'sale', price: '400€' },
            { adType: 'sale', price: '510' },

            // Unambiguous with a stripped textual suffix.
            { adType: 'sale', price: '420 euros' },
            { adType: 'sale', price: '420 Euros.' },

            // Must be refused — extra words that change the meaning, or no
            // number at all. price_cents must stay NULL for every one.
            { adType: 'sale', price: 'Ver a Lista' },
            { adType: 'sale', price: 'Mais barato possível' },
            { adType: 'sale', price: '20 euros ou cartao steam do mesmo valor' },
            { adType: 'sale', price: '45€ negociáveis' },

            // NULL price must stay NULL, not error.
            { adType: 'wanted', price: null },
        ];

        for (const row of rows) {
            const id = randomUUID();
            seeded.push({ id, adType: row.adType, price: row.price });
            await scratchClient.$executeRawUnsafe(
                'INSERT INTO `ads` (`id`, `name`, `author_id`, `price`, `adType`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
                id,
                'Migration fixture',
                '111122223333444455',
                row.price,
                row.adType,
            );
        }

        await runMigrationFile(scratchClient, '20260820000000_ad_lifecycle');
    });

    afterAll(async () => {
        await scratchClient?.$disconnect();
        await adminClient.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${scratchDatabaseName}\``);
        await adminClient.$disconnect();
    });

    const rowFor = async (id: string) => {
        const rows = await scratchClient.$queryRawUnsafe<
            Array<{
                adType: string | null;
                status: string;
                price_cents: number | null;
                images: unknown;
                bumped_at: Date | null;
                expires_at: Date | null;
                sold_at: Date | null;
                deleted_at: Date | null;
                createdAt: Date;
            }>
        >('SELECT * FROM `ads` WHERE `id` = ?', id);
        const row = rows[0];
        if (!row) {
            throw new Error(`No row found for id ${id}`);
        }
        return row;
    };

    test('every existing row is backfilled to status=active', async () => {
        for (const seed of seeded) {
            const row = await rowFor(seed.id);
            expect(row.status).toBe('active');
        }
    });

    test('adType: sale -> sell, sell and wanted untouched', async () => {
        // seeded[0] = { adType: 'sale', price: '25' } — must become 'sell'.
        const wasSale = await rowFor(seeded[0]!.id);
        expect(wasSale.adType).toBe('sell');

        // seeded[1] = { adType: 'sell', price: '65' } — already correct, untouched.
        const wasSell = await rowFor(seeded[1]!.id);
        expect(wasSell.adType).toBe('sell');

        // seeded[2] = { adType: 'wanted', price: null } — a different concept, untouched.
        const wasWanted = await rowFor(seeded[2]!.id);
        expect(wasWanted.adType).toBe('wanted');

        // No row is left as 'sale' anywhere in the table.
        const stillSale = await scratchClient.$queryRawUnsafe<Array<{ c: bigint }>>(
            "SELECT COUNT(*) as c FROM `ads` WHERE `adType` = 'sale'",
        );
        expect(Number(stillSale[0]?.c ?? -1)).toBe(0);
    });

    test('price_cents: parses every unambiguous format', async () => {
        const cases: Array<[string, number]> = [
            ['25', 2500],
            ['17,50€', 1750],
            ['42,5€', 4250],
            ['1', 100],
            ['26,99', 2699],
            ['45€', 4500],
            ['450,00€', 45000],
            ['400€', 40000],
            ['510', 51000],
            ['420 euros', 42000],
            ['420 Euros.', 42000],
        ];

        for (const [price, expectedCents] of cases) {
            const seed = seeded.find((s) => s.price === price);
            expect(seed, `fixture for price "${price}" was not seeded`).toBeTruthy();
            const row = await rowFor(seed!.id);
            expect(row.price_cents, `price "${price}" should parse to ${expectedCents} cents`).toBe(
                expectedCents,
            );
        }
    });

    test('price_cents: refuses ambiguous or non-numeric text rather than guessing', async () => {
        const mustRefuse = [
            'Ver a Lista',
            'Mais barato possível',
            '20 euros ou cartao steam do mesmo valor',
            '45€ negociáveis',
        ];

        for (const price of mustRefuse) {
            const seed = seeded.find((s) => s.price === price);
            expect(seed, `fixture for price "${price}" was not seeded`).toBeTruthy();
            const row = await rowFor(seed!.id);
            expect(row.price_cents, `price "${price}" must NOT be parsed`).toBeNull();
        }
    });

    test('price_cents: NULL price stays NULL', async () => {
        const nullPriceSeed = seeded.find((s) => s.price === null)!;
        const row = await rowFor(nullPriceSeed.id);
        expect(row.price_cents).toBeNull();
    });

    test('expires_at backfilled to createdAt + 30 days for every row', async () => {
        for (const seed of seeded) {
            const row = await rowFor(seed.id);
            expect(row.expires_at).not.toBeNull();
            const diffDays =
                (new Date(row.expires_at as Date).getTime() - new Date(row.createdAt).getTime()) /
                86_400_000;
            expect(Math.round(diffDays)).toBe(30);
        }
    });

    test('images, bumped_at, sold_at, deleted_at are empty for every pre-existing row', async () => {
        for (const seed of seeded) {
            const row = await rowFor(seed.id);
            expect(row.images).toBeNull();
            expect(row.bumped_at).toBeNull();
            expect(row.sold_at).toBeNull();
            expect(row.deleted_at).toBeNull();
        }
    });

    test('no row was deleted by the migration', async () => {
        const count = await scratchClient.$queryRawUnsafe<Array<{ c: bigint }>>(
            'SELECT COUNT(*) as c FROM `ads`',
        );
        expect(Number(count[0]?.c ?? -1)).toBe(seeded.length);
    });

    test('creates the expected indexes', async () => {
        const indexes =
            await scratchClient.$queryRawUnsafe<Array<{ Key_name: string }>>(
                'SHOW INDEX FROM `ads`',
            );
        const names = new Set(indexes.map((i) => i.Key_name));

        expect(names.has('ads_status_expires_at_idx')).toBe(true);
        expect(names.has('ads_status_bumped_at_idx')).toBe(true);
        expect(names.has('ads_author_id_status_idx')).toBe(true);
        expect(names.has('ads_status_adType_createdAt_idx')).toBe(true);
    });
});
