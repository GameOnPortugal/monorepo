-- CreateTable
CREATE TABLE `ads` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `author_id` VARCHAR(191) NULL,
    `channel_id` VARCHAR(191) NULL,
    `message_id` VARCHAR(191) NULL,
    `state` VARCHAR(191) NULL,
    `price` VARCHAR(191) NULL,
    `zone` VARCHAR(191) NULL,
    `dispatch` VARCHAR(191) NULL,
    `warranty` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `adType` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lfgprofile` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `is_banned` BOOLEAN NULL DEFAULT false,
    `banned_at` DATETIME(3) NULL,
    `points` INTEGER NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lfggames` (
    `id` VARCHAR(191) NOT NULL,
    `game` TEXT NULL,
    `description` TEXT NULL,
    `players` INTEGER NULL,
    `playAt` DATETIME(3) NULL,
    `message_id` VARCHAR(191) NULL,
    `platform` VARCHAR(191) NULL,
    `lfgProfile` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lfgparticipations` (
    `id` VARCHAR(191) NOT NULL,
    `lfg_game_id` VARCHAR(191) NULL,
    `lfg_profile_id` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lfgevents` (
    `id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NULL,
    `points` INTEGER NULL,
    `detail` TEXT NULL,
    `is_addressed` BOOLEAN NULL DEFAULT false,
    `admin_note` TEXT NULL,
    `report_user_id` VARCHAR(191) NULL,
    `admin_user_id` VARCHAR(191) NULL,
    `is_parsed` BOOLEAN NULL DEFAULT false,
    `lfg_profile_id` VARCHAR(191) NULL,
    `lfg_game_id` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `screenshots` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `author_id` VARCHAR(191) NULL,
    `channel_id` VARCHAR(191) NULL,
    `message_id` VARCHAR(191) NULL,
    `plataform` VARCHAR(191) NULL,
    `image` VARCHAR(191) NULL,
    `image_md5` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `trophyprofiles` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `psnProfile` VARCHAR(191) NULL,
    `isBanned` BOOLEAN NULL DEFAULT false,
    `hasLeft` BOOLEAN NULL DEFAULT false,
    `isExcluded` BOOLEAN NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `trophies` (
    `id` VARCHAR(191) NOT NULL,
    `trophyProfile` VARCHAR(191) NULL,
    `url` TEXT NULL,
    `points` INTEGER NULL,
    `completionDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stockurls` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `url` VARCHAR(191) NULL,
    `is_validated` BOOLEAN NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `specialchannels` (
    `id` VARCHAR(191) NOT NULL,
    `channelId` VARCHAR(191) NULL,
    `specialType` VARCHAR(191) NULL,
    `data` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commandchannellinks` (
    `id` VARCHAR(191) NOT NULL,
    `command` VARCHAR(191) NULL,
    `channelId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `lfggames` ADD CONSTRAINT `lfggames_lfgProfile_fkey` FOREIGN KEY (`lfgProfile`) REFERENCES `lfgprofile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lfgparticipations` ADD CONSTRAINT `lfgparticipations_lfg_game_id_fkey` FOREIGN KEY (`lfg_game_id`) REFERENCES `lfggames`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lfgparticipations` ADD CONSTRAINT `lfgparticipations_lfg_profile_id_fkey` FOREIGN KEY (`lfg_profile_id`) REFERENCES `lfgprofile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lfgevents` ADD CONSTRAINT `lfgevents_lfg_profile_id_fkey` FOREIGN KEY (`lfg_profile_id`) REFERENCES `lfgprofile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lfgevents` ADD CONSTRAINT `lfgevents_lfg_game_id_fkey` FOREIGN KEY (`lfg_game_id`) REFERENCES `lfggames`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trophies` ADD CONSTRAINT `trophies_trophyProfile_fkey` FOREIGN KEY (`trophyProfile`) REFERENCES `trophyprofiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
