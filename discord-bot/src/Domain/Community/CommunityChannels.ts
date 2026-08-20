export enum CommunityChannels {
    SCREENSHOTS = 'screenshots',
    /**
     * Ops/mod-only channel. Two uses, both added the same day: supervised
     * dry runs of jobs before they post publicly (M6.4), and per-run job
     * summaries from the runner (M6.8). Resolves to #⚛server-log — see
     * DiscordChannels.ts.
     */
    ADMIN = 'admin',
    /**
     * `#📖anuncios` — where every marketplace listing belongs (M5.1). Wired
     * up by `SellSubcommand`, which posts through `GuildClient` instead of
     * `interaction.reply()` so the listing lands here regardless of which
     * channel the command was run from.
     */
    MARKETPLACE = 'marketplace',
    /**
     * Where `trophies:sync` (M7.3) announces a newly-credited trophy
     * (M7.8), replacing the old bot's `TROPHY_WEBHOOK`. Unlike the three
     * channels above, there is no verified snowflake for this one yet — see
     * `DiscordChannels.ts`'s doc comment. An operator must set
     * `DISCORD_CHANNEL_TROPHIES` before `TROPHIES_ANNOUNCE_ENABLED=true`
     * does anything visible.
     */
    TROPHIES = 'trophies',
}
