# Revival plan

A sequenced route from "dormant repo" back to "actively maintained bot", drafted
2026-08-19 after inspecting the live deployment. Numbered items reference
[known-issues.md](known-issues.md).

The situation is better and worse than "dormant" suggests. Better: the bot is
**running**, the data is intact, the community still uses it, and the Docker
build still works. Worse: three features are broken in production *right now*
and nobody found out, because the project has no feedback loop of any kind.

So the ordering principle is: **stop the bleeding, then restore the signal, then
modernise, then add features.** Resist starting at Phase 4.

## Phase 0 — Fix what is broken for users today

Three small changes, each independently shippable, each fixing something the
community is actually hitting.

1. **Fix `/marketplace sell`.** *(issue #0)* Every invocation half-fails and 28
   of 33 post-rewrite ads have an empty `message_id`. Either return the `Ad`
   from `CreateAdHandler` or reuse the `AdId` the subcommand already generated —
   the latter is one line. Also fix the double-reply in the `catch` (use
   `followUp()` when `interaction.replied`). **Write a test for this first**;
   it is precisely the untested layer (issue #14).
2. **Consider backfilling the 28 orphaned `message_id`s.** Optional and fiddly —
   it means matching ads to messages in the marketplace channel by author and
   timestamp. Skip it unless `has-been-sold` (item 24) is going to be ported,
   since that is the only thing that needs them.
3. **The scheduler directory has been deleted.** *(issue #3, resolved)* The
   `scheduler/` container never ran any jobs in production and was not migrated
   to HTZ1; it has been removed. The `week-screenshot-winner` command now has
   no automatic trigger. See plan 02 (M6.1) for the in-process cron replacement.
4. **Stop printing the DB password in the container logs.** *(issue #11)* One
   line in `entrypoint.sh`. Do it before anyone enables Loki.

## Phase 1 — Reconnect deployment to reality

5. **Decide the deployment story.** *(issue #2)* CI still deploys to the
   decommissioned Superman; production is hand-run docker-compose on TedRelayer.
   Options, roughly in order of effort:
   - Point CI at TedRelayer (SSH deploy, or Portainer-style tunnel as the other
     projects on HTZ1 do).
   - Move the stack to a server that is already a CI target.
   - Accept manual deploys, delete the deploy jobs, and document it honestly.

   Any of these is better than the current state, where the pipeline *looks*
   like it deploys and does not.
6. **Back up `~/game-on-portugal/.env`.** It exists in exactly one place, on a
   home server, and it is the only copy of the bot token and DB credentials.
   1Password, like the other projects.
7. **Delete the `CAPROVER_*` secrets** and re-verify `DOCKER_*`,
   `MY_RELEASE_PLEASE_TOKEN`, `TELEGRAM_*`.
8. **Check the backups actually restore.** `databack/mysql-backup` is running and
   writing to the NAS; nobody has verified a restore. Do it once, now, before
   Phase 2 touches the schema.

## Phase 2 — Restore the signal

Cheap, self-contained, and it makes everything after it verifiable.

9. **Fix the 6 type errors and put `tsc --noEmit` in CI.** *(issue #4)* Two are
    genuine (`DeleteAdSubcommand.ts`); four dissolve when Phase 3 settles the
    schema.
10. **Re-enable static analysis in `bot.yaml`.** *(issue #5)* It currently points
    at `TedcryptoOrg/github-actions`, an unrelated org — prefer an inline job.
11. **Add ESLint + Prettier, format the tree in one commit.** *(issue #5)*
12. **Add tests for the discord.js layer.** *(issue #14)* All three live bugs and
    both merged bugfix PRs are in this layer. This is the single highest-value
    piece of engineering hygiene available.
13. **Make `registerSlashCommands` failures loud.** *(issue #15)*
14. **Fix `.env.example`** *(issue #8)* and regenerate the production compose
    file from it — dropping the unused Redis container and the four dead env
    vars while you are there.

## Phase 3 — Fix the schema drift

15. **Decide: are `Ad.state`, `Ad.price`, `Ad.zone` nullable?** *(issue #1)* The
    legacy model, the migrations, and the live database all say **yes**; only
    `schema.prisma` says no. Relaxing the schema file is the low-risk answer and
    erases four type errors.
16. **If you want `NOT NULL` instead**: no production row currently violates it,
    so the alter would succeed today — but write the backfill anyway, because
    `prisma migrate deploy` runs in `entrypoint.sh` and a failing migration is a
    failed boot, not a failed CI job.
17. **Make CI catch drift** with `prisma migrate diff --exit-code`, and switch
    the test setup from `db push` to `migrate deploy` so tests exercise the same
    path as production.

## Phase 4 — Modernise

18. **Bump minors, verify, then majors one at a time.** *(issue #7)* Prisma 6→7
    (needs a generator `output` path, issue #13), Inversify 7→8, uuid 11→14 need
    real attention; discord.js 14.18→14.27 is a minor but the most likely to
    change runtime behaviour — and may fix the `@discordjs/ws` boot error.
19. **`ephemeral: true` → `flags: MessageFlags.Ephemeral`** in 7 sites. *(#13)*
20. **`::set-output` → `$GITHUB_OUTPUT`** in `shared.build-image.yaml`. *(#13)*
21. **Bound the entrypoint's DB wait**, fail loudly, parse `DATABASE_URL`
    robustly. *(issue #12)*
22. **Get release-please working.** *(issue #6)* Verify the token and use
    conventional commits — 30+ consecutive `chore:` commits is why nothing has
    ever released. (Note: `scheduler` component removed from manifest.)
23. **Move the hardcoded channel/emoji IDs to config.** *(issue #16)*

## Phase 5 — Decide the fate of the dead weight

24. ✅ **`webpage/`.** **Done (2026-08-21).** Resolved the third way this item did
    not anticipate: neither branch of the either/or, because M8 built a real
    portal. The apex now serves `portal/` from HTZ1, `gameonportugal.github.io`
    is archived, and the directory plus its labeler entry are deleted (its
    release-please entry had already gone with the M8.2 scaffold). Preserved in
    git history — `git log -- webpage`.
25. ✅ **`old-discord-bot/`.** **Done (2026-08-20, M9.6).** Deleted outright
    rather than moved to `reference/` — git history already preserves every
    version (`git log -- old-discord-bot`), so a `reference/` copy would have
    been a second, staler copy of the same information. Deleted once M7 had
    taken what it needed (the psnprofiles.com scraper → `TrophySource` /
    `PsnProfilesTrophySource`) and LFG/stock/Telegram were formally dropped
    (M9.3, M9.4) rather than ported.
26. **Archive the standalone `GameOnPortugal/scheduler` repo** (not yet done, out
    of scope for M6.7; separate from the deleted `scheduler/` directory).

## Phase 6 — Close the feature gap

27. **The psnprofiles.com scraper.** *(highest user-visible value — issue #10)*
    `/trophy rank` currently presents a leaderboard frozen since **December
    2024** as though it were current. 118 profiles are waiting for data. The
    scraper lives in `old-discord-bot/scripts/parse-psn-profile.js`;
    `RetryAxiosHttpClient` is already bound and unused, clearly in anticipation.
    Once ported, it will be triggered by the in-process job runner (plan 02, M6.1).
28. **LFG.** The largest gap: 11 subcommands plus a points engine. The Prisma
    models exist but the tables are **empty**, so this is greenfield — no
    migration, but also no continuity with the community's old rankings, which
    is worth telling users. Port subcommand-by-subcommand, each with a test.
29. **`has-been-sold`** — marketplace cleanup. Small, depends on `message_id`
    being correct (items 1–2), and will be triggered by the in-process job
    runner (plan 02, M6.1).
30. **`market wanted`** — the counterpart to `/marketplace sell`.
31. **`stock`** — stock-alert URL watching. Lowest value; consider dropping.

As each lands, add it to the in-process job runner (plan 02, M6.1). The old
scheduler container directory has been deleted.

## If you only do one thing

Fix `/marketplace sell` (item 1). It is a one-line change, it is failing for
real users today, and the test you write for it is the first brick of the safety
net the whole project is missing.
