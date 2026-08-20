import { mkdir, readFile, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

/**
 * Where `registerSlashCommands()` remembers the hash of the last command set
 * it successfully PUT to Discord (M4.3).
 *
 * This is a plain file under the container's `$HOME`
 * (`docker/Dockerfile` sets `HOME=/home/app`, owned by the unprivileged
 * `app` user the process runs as), not a database row: `schema.prisma` has
 * no key-value/settings table today, and adding one for a single cache byte
 * would mean a migration for a value that is fine to lose. The bot image
 * also has **no persistent volume** for its own filesystem (only MariaDB and
 * MinIO get one in `infrastructure/game-on-portugal.yaml` /
 * `docker-compose.yml`) — every real redeploy (a new image, hence a new
 * container) starts with an empty `$HOME` and re-registers once regardless.
 * What this *does* still skip is the redundant PUT on a same-container
 * restart (a crash loop, a manual Portainer restart, a local dev
 * `bun run src/index.ts` re-run) — the case that was actually costing an
 * unconditional PUT on every single boot before this.
 *
 * Filed per registration scope (`command-set-<scope>[-<guildId>].hash`) so
 * switching between guild-scoped dev and global registration — or between
 * two different dev guilds — can never read a stale hash left by a
 * different target and wrongly skip a PUT that target actually needs.
 */
export class CommandSetHashStore {
    private readonly directory: string;

    constructor(directory: string = join(homedir(), '.gop-bot')) {
        this.directory = directory;
    }

    async read(scopeKey: string): Promise<string | undefined> {
        try {
            const contents = await readFile(this.filePath(scopeKey), 'utf-8');
            return contents.trim() || undefined;
        } catch {
            // Missing file (first boot, fresh container, directory not yet
            // created) is the expected common case, not an error — it just
            // means "no known previous hash", so the caller always writes.
            return undefined;
        }
    }

    async write(scopeKey: string, hash: string): Promise<void> {
        await mkdir(this.directory, { recursive: true });
        await writeFile(this.filePath(scopeKey), hash, 'utf-8');
    }

    private filePath(scopeKey: string): string {
        return join(this.directory, `command-set-${scopeKey}.hash`);
    }
}
