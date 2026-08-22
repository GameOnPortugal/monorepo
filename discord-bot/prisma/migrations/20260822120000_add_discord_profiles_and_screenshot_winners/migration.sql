-- CreateTable
CREATE TABLE `discord_profiles` (
    `discordId` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NULL,
    `avatarUrl` TEXT NULL,
    `avatarHash` VARCHAR(191) NULL,
    `syncedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `discord_profiles_syncedAt_idx`(`syncedAt`),
    PRIMARY KEY (`discordId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `screenshot_winners` (
    `id` VARCHAR(191) NOT NULL,
    `screenshotId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NULL,
    `weekStart` DATETIME(3) NOT NULL,
    `weekEnd` DATETIME(3) NOT NULL,
    `voteCount` INTEGER NULL,
    `messageUrl` TEXT NULL,
    `announcementMessageId` VARCHAR(191) NULL,
    `source` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `screenshot_winners_screenshotId_idx`(`screenshotId`),
    UNIQUE INDEX `screenshot_winners_weekStart_key`(`weekStart`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

