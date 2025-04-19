import {CustomEmoji} from "../../../Domain/Community/CustomEmoji.ts";

export enum DiscordEmoji {
    TROPHY_PLAT = '820982755927392297',
    TROPHY_GOLD = '820982755520937984',
    TROPHY_SILVER = '820982755525132358',
    TROPHY_BRONZE = '820982755646636052',
}

export const convertEmoji = (emoji: CustomEmoji): DiscordEmoji => {
    switch (emoji) {
        case CustomEmoji.TROPHY_PLAT:
            return DiscordEmoji.TROPHY_PLAT;
        case CustomEmoji.TROPHY_GOLD:
            return DiscordEmoji.TROPHY_GOLD;
        case CustomEmoji.TROPHY_SILVER:
            return DiscordEmoji.TROPHY_SILVER;
        case CustomEmoji.TROPHY_BRONZE:
            return DiscordEmoji.TROPHY_BRONZE;
    }
}
