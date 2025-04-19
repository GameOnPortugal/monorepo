import { inject, injectable } from "inversify";
import { TYPES } from "../../../../Infrastructure/DependencyInjection/types";
import type { AdRepository } from "../../../../Domain/Marketplace/AdRepository";
import { ListUserAds } from "./ListUserAds";
import type Logger from "../../../Logger/Logger";
import type {Ad} from "../../../../Domain/Marketplace/Ad.ts";

@injectable()
export class ListUserAdsHandler {
    constructor(
        @inject(TYPES.Logger) private readonly logger: Logger,
        @inject(TYPES.AdRepository) private readonly adRepository: AdRepository
    ) {}

    public async handle(query: ListUserAds): Promise<Ad[]> {
        this.logger.info('Handling ListUserAds query', { userId: query.userId });
        return await this.adRepository.findByUserId(query.userId);
    }
}
