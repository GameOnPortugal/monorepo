const TYPES = {
  // Generics
  CommandHandler: Symbol.for('CommandHandler'),
  EventHandler: Symbol.for('EventHandler'),
  Logger: Symbol.for('Logger'),
  Bot: Symbol.for('Bot'),

  // Bot
  MentionHandler: Symbol.for('MentionHandler'),
  SlashCommandHandler: Symbol.for('SlashCommandHandler'),

  // Security

  // Factories

  // Repositories
  ScreenshotRepository: Symbol.for('ScreenshotRepository'),
  TrophyProfileRepository: Symbol.for('TrophyProfileRepository'),
  TrophyRepository: Symbol.for('TrophyRepository'),
  AdRepository: Symbol.for('AdRepository'),

  // Clients
  HttpClient: Symbol.for('HttpClient'),
  OrmClient: Symbol.for('OrmClient'),
  GuildClient: Symbol.for('GuildClient'),
}

export { TYPES }
