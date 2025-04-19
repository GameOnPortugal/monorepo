import {PrismaClient} from "@prisma/client";
import {myContainer} from "../../src/Infrastructure/DependencyInjection/inversify.config";
import {TYPES} from "../../src/Infrastructure/DependencyInjection/types";

export default class DatabaseUtil {
    public static async truncateAllTables(prismaClient?: PrismaClient) {
        prismaClient ??= myContainer.get<PrismaClient>(TYPES.OrmClient);

        await prismaClient.$executeRaw`SET FOREIGN_KEY_CHECKS=0`;

        await prismaClient.$executeRaw`TRUNCATE TABLE trophyprofiles`;
        await prismaClient.$executeRaw`TRUNCATE TABLE trophies`;
        await prismaClient.$executeRaw`TRUNCATE TABLE screenshots`;
        await prismaClient.$executeRaw`TRUNCATE TABLE ads`;

        await prismaClient.$executeRaw`SET FOREIGN_KEY_CHECKS=1`;
    }
}