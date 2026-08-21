import { inject, injectable } from 'inversify';
import { PrismaClient } from '@prisma/client';
import { TYPES } from '../DependencyInjection/types';
import type { PrivacyRepository } from '../../Domain/Privacy/PrivacyRepository';

@injectable()
export class OrmPrivacyRepository implements PrivacyRepository {
    constructor(@inject(TYPES.OrmClient) private readonly prismaClient: PrismaClient) {}

    async isOptedOut(discordId: string): Promise<boolean> {
        // Deliberately no try/catch: a query failure must propagate so a
        // public-read-path caller fails closed instead of quietly getting
        // `false` — see PrivacyRepository.ts's doc comment.
        const row = await this.prismaClient.privacySetting.findUnique({
            where: { discordId },
            select: { publicOptOut: true },
        });

        // No row at all means "never touched the flag" — opted in, not an
        // error. Only a thrown exception represents "could not be read".
        return row?.publicOptOut ?? false;
    }

    async setOptOut(discordId: string, optOut: boolean): Promise<void> {
        await this.prismaClient.privacySetting.upsert({
            where: { discordId },
            update: { publicOptOut: optOut },
            create: { discordId, publicOptOut: optOut },
        });
    }

    async delete(discordId: string): Promise<void> {
        // `deleteMany` rather than `delete`, so a member who was never
        // opted out (and so has no row) can still be told "your data was
        // removed" without this throwing a not-found error first.
        await this.prismaClient.privacySetting.deleteMany({ where: { discordId } });
    }
}
