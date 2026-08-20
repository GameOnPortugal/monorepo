const TYPES = {
    // Generics
    CommandHandler: Symbol.for('CommandHandler'),
    EventHandler: Symbol.for('EventHandler'),
    Logger: Symbol.for('Logger'),
    Bot: Symbol.for('Bot'),

    // Bot
    MentionHandler: Symbol.for('MentionHandler'),
    SlashCommandHandler: Symbol.for('SlashCommandHandler'),
    // M4.7/M4.8 — the two non-chat-input dispatch tables. Both are
    // @optional() at the BotExecutor injection site, so a container with no
    // bindings for them is valid.
    ComponentHandler: Symbol.for('ComponentHandler'),
    AutocompleteHandler: Symbol.for('AutocompleteHandler'),

    // Security

    // Factories

    // Repositories
    ScreenshotRepository: Symbol.for('ScreenshotRepository'),
    TrophyProfileRepository: Symbol.for('TrophyProfileRepository'),
    TrophyRepository: Symbol.for('TrophyRepository'),
    AdRepository: Symbol.for('AdRepository'),
    JobStateRepository: Symbol.for('JobStateRepository'),

    // Clients
    HttpClient: Symbol.for('HttpClient'),
    TrophySource: Symbol.for('TrophySource'),
    OrmClient: Symbol.for('OrmClient'),
    GuildClient: Symbol.for('GuildClient'),

    // Jobs
    JobReporter: Symbol.for('JobReporter'),
    MediaStorage: Symbol.for('MediaStorage'),
    SafeImageFetcher: Symbol.for('SafeImageFetcher'),
};

export { TYPES };
