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
}
