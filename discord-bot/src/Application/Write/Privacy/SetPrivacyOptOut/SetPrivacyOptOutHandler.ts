import { inject, injectable } from 'inversify';
import type CommandHandler from '../../../../Domain/Command/CommandHandler';
import { SetPrivacyOptOut } from './SetPrivacyOptOut';
import type { PrivacyRepository } from '../../../../Domain/Privacy/PrivacyRepository';
import { TYPES } from '../../../../Infrastructure/DependencyInjection/types';
import type Logger from '../../../Logger/Logger';

@injectable()
export class SetPrivacyOptOutHandler implements CommandHandler<SetPrivacyOptOut> {
    constructor(
        @inject(TYPES.PrivacyRepository)
        private readonly privacyRepository: PrivacyRepository,
        @inject(TYPES.Logger) private readonly logger: Logger,
    ) {}

    async handle(command: SetPrivacyOptOut): Promise<void> {
        await this.privacyRepository.setOptOut(command.discordId, command.optOut);

        this.logger.info('Privacy opt-out updated', {
            discordId: command.discordId,
            optOut: command.optOut,
        });
    }
}
