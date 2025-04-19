import {myContainer} from "../../src/Infrastructure/DependencyInjection/inversify.config";
import { PrismaClient } from "@prisma/client";
import {TYPES} from "../../src/Infrastructure/DependencyInjection/types";
import {ScreenshotId} from "../../src/Domain/Screenshot/ScreenshotId.ts";
import { Screenshot } from "../../src/Domain/Screenshot/Screenshot.ts";
import type {ScreenshotRepository} from "../../src/Domain/Screenshot/ScreenshotRepository.ts";
import { TrophyProfile } from "../../src/Domain/Trophy/TrophyProfile.ts";
import {TrophyProfileId} from "../../src/Domain/Trophy/TrophyProfileId.ts";
import type {TrophyProfileRepository} from "../../src/Domain/Trophy/TrophyProfileRepository.ts";
import {TrophyId} from "../../src/Domain/Trophy/TrophyId.ts";
import type {TrophyRepository} from "../../src/Domain/Trophy/TrophyRepository.ts";
import {Trophy} from "../../src/Domain/Trophy/Trophy.ts";
import { AdId } from "../../src/Domain/Marketplace/AdId.ts";
import { Ad } from "../../src/Domain/Marketplace/Ad.ts";
import type { AdRepository } from "../../src/Domain/Marketplace/AdRepository.ts";

const prismaClient: PrismaClient = myContainer.get(TYPES.OrmClient);

export const createScreenshot = async (
    id?: ScreenshotId,
    name?: string,
    authorId?: string,
    channelId?: string,
    messageId?: string,
    platform?: string,
    image?: string,
    imageMd5?: string,
    createdAt?: Date,
    updatedAt?: Date,
): Promise<Screenshot> => {
    const screenshot = new Screenshot(
        id ?? ScreenshotId.generate(),
        name ?? 'Test Screenshot',
        authorId ?? '123456789012345678',
        channelId ?? '987654321098765432',
        messageId ?? '123987456654789321',
        platform ?? 'playstation',
        image ?? 'https://placehold.co/600x400/png',
        imageMd5 ?? '5eb63bbbe01eeed093cb22bb8f5acdc3',
        createdAt ?? new Date(),
        updatedAt ?? new Date()
    );

    await myContainer.get<ScreenshotRepository>(TYPES.ScreenshotRepository).save(screenshot);

    return screenshot;
};

export const createTrophyProfile = async (
    id?: TrophyProfileId,
    userId?: string,
    psnProfile?: string,
    isBanned?: boolean,
    hasLeft?: boolean,
    isExcluded?: boolean
): Promise<TrophyProfile> => {
    const trophyProfile = new TrophyProfile(
        id ?? TrophyProfileId.generate(),
        userId ?? '123456789012345678',
        psnProfile ?? 'TestPSNProfile',
        isBanned ?? false,
        hasLeft ?? false,
        isExcluded ?? false,
        new Date(),
        new Date()
    );

    await myContainer.get<TrophyProfileRepository>(TYPES.TrophyProfileRepository).save(trophyProfile);

    return trophyProfile;
};

export const createTrophy = async (
    id?: TrophyId,
    trophyProfile?: string | TrophyProfile,
    url?: string,
    points?: number,
    completionDate?: Date
): Promise<Trophy> => {
    // Handle trophyProfile parameter
    let profileId: string | null = null;

    if (trophyProfile instanceof TrophyProfile) {
        profileId = trophyProfile.id.toString();
    } else if (typeof trophyProfile === 'string') {
        profileId = trophyProfile;
    }

    const trophy = new Trophy(
        id ?? TrophyId.generate(),
        profileId,
        url ?? 'https://example.com/trophy.png',
        points ?? 15,
        completionDate ?? new Date(),
        new Date(),
        new Date()
    );

    await myContainer.get<TrophyRepository>(TYPES.TrophyRepository).save(trophy);

    return trophy;
};

export const createTrophySetup = async (
    userId?: string,
    psnProfile?: string,
    trophyCount: number = 3
): Promise<{
    profile: TrophyProfile,
    trophies: Trophy[]
}> => {
    // Create trophy profile
    const profile = await createTrophyProfile(
        undefined,
        userId,
        psnProfile
    );

    // Create trophies
    const trophies: Trophy[] = [];
    for (let i = 0; i < trophyCount; i++) {
        const trophy = await createTrophy(
            undefined,
            profile,
            `https://example.com/trophy${i}.png`,
            10 + (i * 5), // 10, 15, 20, etc.
            new Date(Date.now() - (i * 86400000)) // Different dates
        );
        trophies.push(trophy);
    }

    return {
        profile,
        trophies
    };
};

export const createAd = async (
    id?: AdId,
    name?: string,
    authorId?: string,
    channelId?: string,
    messageId?: string,
    state?: string,
    price?: string,
    zone?: string,
    dispatch?: string,
    warranty?: string,
    description?: string,
    adType?: string,
    createdAt?: Date,
    updatedAt?: Date,
): Promise<Ad> => {
    const ad = new Ad(
        id ?? AdId.generate(),
        name ?? 'Test Ad',
        authorId ?? '123456789012345678',
        channelId ?? '987654321098765432',
        messageId ?? '123987456654789321',
        state ?? 'active',
        price ?? '100€',
        zone ?? 'Porto',
        dispatch ?? 'Included',
        warranty ?? '2 years',
        description ?? 'Test ad description',
        adType ?? 'sale',
        createdAt ?? new Date(),
        updatedAt ?? new Date()
    );

    await myContainer.get<AdRepository>(TYPES.AdRepository).save(ad);

    return ad;
};
