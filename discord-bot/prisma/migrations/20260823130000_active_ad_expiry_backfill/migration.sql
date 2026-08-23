-- M6.9 — give every `active` ad a deadline, so the lifecycle backstop has
-- something to act on.
--
-- Context: until now `expires_at` was only meaningful while an ad sat in
-- `pending_renewal`, where it holds the 72h reply deadline. On an `active`
-- row it was whatever M5.3's backfill left there (createdAt + 30 days) and
-- nothing enforced it — `RenewAdHandler` even cleared it back to NULL. The
-- portal, meanwhile, renders the column publicly as "Expira". Production on
-- 2026-08-23: five ads showing "Expira 10 de maio de 2025", still listed,
-- fifteen months later.
--
-- The code fix (CreateAd/RenewAd/BumpAd now always set it,
-- `ads:lifecycle` now expires anything past it) only covers rows written
-- from here on. This closes the gap underneath it so the invariant "an
-- active ad always has a deadline" holds for rows that already exist —
-- without it, an `active` row with a NULL `expires_at` is invisible to the
-- backstop and lives forever, which is the exact bug being fixed.
--
-- No schema change, no DELETE (cross-cutting rule 2: soft-delete only), and
-- deliberately scoped to `active` rows:
--   * `pending_renewal` rows own their `expires_at` as a reply deadline —
--     overwriting it would silently grant 30 more days to someone who was
--     already asked to answer within 72 hours.
--   * `expired`/`sold`/soft-deleted rows are finished; their timestamps are
--     history, not a schedule.
--
-- The window is measured from the last sign of life (`bumped_at`, falling
-- back to `createdAt`) rather than from today, so a row that has been idle
-- for a year is already past due and gets expired on the next run, instead
-- of being handed a fresh 30 days it did nothing to earn.
--
-- Expected effect on production today: zero rows (all five `active` rows
-- already carry M5.3's backfilled date). It is here for the environments
-- where that is not true and for every row written between M5.3 and this
-- migration.
UPDATE `ads`
SET `expires_at` = DATE_ADD(COALESCE(`bumped_at`, `createdAt`), INTERVAL 30 DAY)
WHERE `status` = 'active'
  AND `deleted_at` IS NULL
  AND `expires_at` IS NULL;
