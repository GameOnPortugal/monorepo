/**
 * M5.10 — nothing stopped one member posting fifty listings. `sell`/`wanted`
 * both check this before ever posting to `📖anuncios`, not inside
 * `CreateAdHandler`: post-then-persist (M0.1) means a limit enforced only at
 * the handler would refuse the write *after* the listing is already public,
 * turning a routine "you're at your limit" into the exact orphaned-message
 * failure mode M0.1 was fixed to stop producing. A single constant here is
 * what keeps `SellSubcommand`/`WantedSubcommand` (and any future create
 * path) agreeing on the same number.
 */
export const MAX_ACTIVE_ADS_PER_USER = 10;
