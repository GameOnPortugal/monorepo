import { myContainer } from '../src/Infrastructure/DependencyInjection/inversify.config'
import { type ConsoleCommand } from '../src/Domain/Console/ConsoleCommand'
import { TYPES } from '../src/Infrastructure/DependencyInjection/types'
import type Logger from '../src/Application/Logger/Logger'
import WeekScreenshotWinner from "../src/Ui/Cli/WeekScreenshotWinner.ts";

const logger = myContainer.get<Logger>(TYPES.Logger)
const consoleCommands: Record<string, ConsoleCommand> = {}
consoleCommands[WeekScreenshotWinner.commandName.toString()] = myContainer.get<WeekScreenshotWinner>(WeekScreenshotWinner)

async function run (): Promise<void> {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    throw new Error('Missing command to run! Run "help" to see the available commands')
  }

  const commandArgs = args.slice(1)
  const action = args[0]

  if (!action || action === 'help') {
    console.log('Available commands:')
    console.log(Object.keys(consoleCommands).join('\n'))
    return
  }

  if (!(action in consoleCommands)) {
    throw new Error(`Unknown action: ${action}`)
  }

  await consoleCommands[action]?.run(commandArgs)
}

run()
  .then(() => {
    logger.info('Done!')
    process.exit(0)
  })
  .catch((error: any) => {
    logger.error(`Error: ${error.message}`, { error })
    process.exit(1)
  })
