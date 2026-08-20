-- M5.3 — ad lifecycle columns, indexes and adType normalisation.
--
-- Safe on the live 70-row `ads` table: only ADD COLUMN / CREATE INDEX (no
-- rewrite of existing columns) plus three narrowly-targeted UPDATEs. Nothing
-- here DELETEs a row — soft-delete is why `deleted_at` exists (cross-cutting
-- rule 2).

-- ---------------------------------------------------------------------------
-- 1. New columns.
--
-- `status` is NOT NULL DEFAULT 'active' so every existing row is backfilled
-- to 'active' by the ALTER TABLE itself — MariaDB fills existing rows with a
-- column's literal default as part of adding it, no separate UPDATE needed.
-- ---------------------------------------------------------------------------
ALTER TABLE `ads`
    ADD COLUMN `status`      VARCHAR(191) NOT NULL DEFAULT 'active',
    ADD COLUMN `price_cents` INTEGER NULL,
    ADD COLUMN `images`      TEXT NULL,
    ADD COLUMN `bumped_at`   DATETIME(3) NULL,
    ADD COLUMN `expires_at`  DATETIME(3) NULL,
    ADD COLUMN `sold_at`     DATETIME(3) NULL,
    ADD COLUMN `deleted_at`  DATETIME(3) NULL;

-- ---------------------------------------------------------------------------
-- 2. Normalise `adType`: 'sale' -> 'sell' (docs/known-issues.md #22).
--
-- Production reality (checked directly, 2026-08-20): `sell` (35 rows) is what
-- the OLD bot wrote, Nov 2024 - Apr 2025. `sale` (28 rows) is what the
-- CURRENT bot has written for every ad since the April 2025 rewrite — it is
-- the exact same 28 rows that have `message_id IS NULL` (the write-back bug,
-- issue #0/#1). They are real, current ads, not junk; they are not
-- special-cased here. Converging on 'sell' matches the old bot and the
-- `/marketplace sell` subcommand name. The live write path is also fixed in
-- this PR (Domain/Marketplace/Ad.ts normalises on construction) so this is a
-- one-time backfill, not a recurring cleanup.
-- ---------------------------------------------------------------------------
UPDATE `ads` SET `adType` = 'sell' WHERE `adType` = 'sale';

-- ---------------------------------------------------------------------------
-- 3. Parse `price_cents` from the free-text `price` column, only where the
-- entire (trimmed, case-folded) value is unambiguously a number:
--
--   optional leading '€', digits, optional decimal separator ('.' or ',')
--   followed by 1-2 digits, optional trailing '€' or 'euros'/'euros.'
--
-- The decimal separator is read pt-PT style (',' or '.' both mean "decimal
-- point", never "thousands separator") — matches the real data, e.g.
-- '17,50€' -> 1750 cents, '42,5€' -> 4250 cents.
--
-- Deliberately refused (left NULL, never guessed): anything with extra words
-- that change the meaning ('45€ negociáveis', '20 euros ou cartao steam do
-- mesmo valor'), free text ('Ver a Lista', 'Mais barato possível'), ranges,
-- and anything else that doesn't match the pattern above. A naive
-- "grab the first number" parse would silently misrepresent what the seller
-- wrote, which is exactly what "never guess" rules out.
-- ---------------------------------------------------------------------------
UPDATE `ads`
SET `price_cents` = ROUND(
    CAST(
        REPLACE(
            REGEXP_REPLACE(
                LOWER(TRIM(`price`)),
                '^€? *([0-9]+([.,][0-9]{1,2})?) *(€|euros\\.?)?$',
                '\\1'
            ),
            ',', '.'
        ) AS DECIMAL(20,4)
    ) * 100
)
WHERE `price` IS NOT NULL
  AND LOWER(TRIM(`price`)) REGEXP '^€? *[0-9]+([.,][0-9]{1,2})? *(€|euros\\.?)?$';

-- ---------------------------------------------------------------------------
-- 4. Backfill `expires_at` for every pre-existing row (createdAt + 30 days —
-- the settled lifecycle timing, plan 02). This is what makes decision 1 in
-- 01-marketplace-overhaul.md ("the 28 orphaned message_id rows are not
-- backfilled heuristically — they get marked expired on the first lifecycle
-- run") actually true without any row-specific logic: those 28 rows are all
-- months past createdAt + 30d already, so the M6 lifecycle sweep
-- (`status = 'active' AND expires_at < now()`) picks them up on its own.
-- ---------------------------------------------------------------------------
UPDATE `ads` SET `expires_at` = DATE_ADD(`createdAt`, INTERVAL 30 DAY);

-- ---------------------------------------------------------------------------
-- 5. Indexes for the M5.5-M5.9 query patterns.
-- ---------------------------------------------------------------------------
-- Lifecycle sweep: "every active ad whose expiry has passed".
CREATE INDEX `ads_status_expires_at_idx` ON `ads`(`status`, `expires_at`);

-- Idle-bump sweep and default listing sort (most recently bumped first).
CREATE INDEX `ads_status_bumped_at_idx` ON `ads`(`status`, `bumped_at`);

-- "my active ads" / the 10-active-ads-per-user limit (M5.10).
CREATE INDEX `ads_author_id_status_idx` ON `ads`(`author_id`, `status`);

-- search() (M5.9) filtering by type within a status, newest first.
CREATE INDEX `ads_status_adType_createdAt_idx` ON `ads`(`status`, `adType`, `createdAt`);
