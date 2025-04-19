import {CommunityChannels} from "../../../Domain/Community/CommunityChannels.ts";

export enum DiscordChannels {
    SCREENSHOTS = '827646847483904040',
}

export const convertChannel = (channel: CommunityChannels): DiscordChannels => {
    switch (channel) {
        case CommunityChannels.SCREENSHOTS:
            return DiscordChannels.SCREENSHOTS;
    }
}
