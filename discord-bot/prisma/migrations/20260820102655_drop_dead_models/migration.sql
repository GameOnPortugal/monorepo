/*
  Warnings:

  - You are about to drop the `commandchannellinks` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `lfgevents` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `lfggames` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `lfgparticipations` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `lfgprofile` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `specialchannels` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `stockurls` table. If the table is not empty, all the data it contains will be lost.

*/

-- Guard (M9.2/M9.3/M9.4, docs/plans/GLOBAL-PLAN.md): all seven tables below
-- were verified empty in production on 2026-08-20 and are being dropped
-- outright rather than soft-deleted — cross-cutting rule 2 ("soft-delete,
-- never hard-delete") governs *user data*, and these are empty tables for
-- features that will never exist (LFG, closed to discussion; stock alerts;
-- the special-channel validator replaced by AutoMod; command-channel links
-- superseded by static config).
--
-- `prisma migrate deploy` runs on every container boot (docker/entrypoint.sh),
-- so if this migration's premise stops holding between being written and
-- being run, the DROP TABLE statements below would destroy real rows with no
-- way back — an unattended DROP TABLE IF EXISTS would fail exactly the same
-- way, just silently. So: re-count every table immediately before dropping
-- anything, and if any of them holds a row, abort the whole migration loudly
-- by forcing a real SQL error (there is no bare SIGNAL outside a stored
-- routine without switching DELIMITER, which the migration engine does not
-- support) rather than silently succeeding or silently deleting data. A
-- failed migration is a failed boot (cross-cutting rule 5) — the correct
-- outcome here, because it means a human has to look before anything is lost.
SET @dead_model_row_count = (
  SELECT COALESCE(SUM(cnt), 0) FROM (
    SELECT COUNT(*) AS cnt FROM `lfgprofile`
    UNION ALL SELECT COUNT(*) FROM `lfggames`
    UNION ALL SELECT COUNT(*) FROM `lfgevents`
    UNION ALL SELECT COUNT(*) FROM `lfgparticipations`
    UNION ALL SELECT COUNT(*) FROM `stockurls`
    UNION ALL SELECT COUNT(*) FROM `specialchannels`
    UNION ALL SELECT COUNT(*) FROM `commandchannellinks`
  ) AS counts
);

SET @dead_model_guard_sql = IF(
  @dead_model_row_count = 0,
  'SELECT 1',
  'SELECT 1 FROM `MIGRATION_ABORTED_dead_model_tables_are_not_empty_see_GLOBAL_PLAN_M9_2_M9_3_M9_4`'
);

PREPARE dead_model_guard FROM @dead_model_guard_sql;
EXECUTE dead_model_guard;
DEALLOCATE PREPARE dead_model_guard;

-- DropForeignKey
ALTER TABLE `lfgevents` DROP FOREIGN KEY `lfgevents_lfg_game_id_fkey`;

-- DropForeignKey
ALTER TABLE `lfgevents` DROP FOREIGN KEY `lfgevents_lfg_profile_id_fkey`;

-- DropForeignKey
ALTER TABLE `lfggames` DROP FOREIGN KEY `lfggames_lfgProfile_fkey`;

-- DropForeignKey
ALTER TABLE `lfgparticipations` DROP FOREIGN KEY `lfgparticipations_lfg_game_id_fkey`;

-- DropForeignKey
ALTER TABLE `lfgparticipations` DROP FOREIGN KEY `lfgparticipations_lfg_profile_id_fkey`;

-- DropTable
DROP TABLE `commandchannellinks`;

-- DropTable
DROP TABLE `lfgevents`;

-- DropTable
DROP TABLE `lfggames`;

-- DropTable
DROP TABLE `lfgparticipations`;

-- DropTable
DROP TABLE `lfgprofile`;

-- DropTable
DROP TABLE `specialchannels`;

-- DropTable
DROP TABLE `stockurls`;
