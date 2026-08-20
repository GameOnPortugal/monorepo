import { PrismaClient } from '@prisma/client';
import { myContainer } from '../../src/Infrastructure/DependencyInjection/inversify.config';
import { TYPES } from '../../src/Infrastructure/DependencyInjection/types';

export default class DatabaseUtil {
    /**
     * Empties every table between tests.
     *
     * All of it runs inside `$transaction`'s interactive callback, and that is
     * load-bearing rather than tidiness.
     *
     * `FOREIGN_KEY_CHECKS` is a **session** variable, and Prisma talks to
     * MySQL through a connection *pool*. Issued as separate `$executeRaw`
     * calls, the `SET ...=0` lands on whichever connection the pool hands out
     * first and the `TRUNCATE`s can each land on a different one — where
     * checks are still enabled. MySQL then refuses with
     *
     *     1701: Cannot truncate a table referenced in a foreign key
     *     constraint (`trophies` -> `trophyprofiles`)
     *
     * because it rejects TRUNCATE on a table referenced by a foreign key
     * whether or not the child holds any rows.
     *
     * The pool usually hands back the connection it just freed, so this
     * passed almost every time locally and failed intermittently in CI, where
     * there are fewer cores, a smaller pool and more contention. It surfaced
     * as an unrelated test failing in `beforeEach` with an absurd reported
     * duration (469923ms inside an 11-second run), which points nowhere near
     * the real cause.
     *
     * `$transaction` with a callback pins one connection for its whole body,
     * so the `SET` and every `TRUNCATE` are guaranteed to be the same session.
     *
     * Note the TRUNCATEs still each cause an implicit commit — MySQL DDL
     * cannot be rolled back — so this is not atomic and is not trying to be.
     * The transaction is here purely to pin the connection.
     */
    public static async truncateAllTables(prismaClient?: PrismaClient) {
        prismaClient ??= myContainer.get<PrismaClient>(TYPES.OrmClient);

        await prismaClient.$transaction(async (tx) => {
            await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');

            // Order is irrelevant while checks are off, but children are
            // listed before parents anyway so the intent survives if someone
            // later removes the SET.
            await tx.$executeRawUnsafe('TRUNCATE TABLE trophies');
            await tx.$executeRawUnsafe('TRUNCATE TABLE trophyprofiles');
            await tx.$executeRawUnsafe('TRUNCATE TABLE screenshots');
            await tx.$executeRawUnsafe('TRUNCATE TABLE ads');
            await tx.$executeRawUnsafe('TRUNCATE TABLE job_runs');

            // Restored on the same connection before it returns to the pool.
            // Leaving it at 0 would silently disable referential integrity for
            // every later test that happens to be handed this connection.
            await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
        });
    }
}
