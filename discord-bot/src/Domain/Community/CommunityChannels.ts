export enum CommunityChannels {
    SCREENSHOTS = 'screenshots',
    /**
     * Ops/mod-only channel used for supervised dry runs of jobs before they
     * are allowed to post publicly (M6.4). Not yet wired to a verified
     * production ID — see DiscordChannels.ts.
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
