import type { Screenshot } from './Screenshot.ts';
import type { ScreenshotId } from './ScreenshotId.ts';

export interface ScreenshotRepository {
    save: (screenshot: Screenshot) => Promise<void>;

    /**
     * @throws RecordNotFound
     */
    get(id: ScreenshotId): Promise<Screenshot>;

    findByWeek(week: Date): Promise<Screenshot[]>;

    delete(id: ScreenshotId): Promise<void>;

    findByMd5(md5: string): Promise<Screenshot | null>;

    findBy(userId: string | null): Promise<Screenshot[]>;

    /**
     * Rows whose `image` still points at a Discord CDN host — the
     * candidate set for RelinkScreenshotsJob (M6.3). DB-side filtering
     * rather than "load everything and filter in JS" is what makes repeated
     * runs over 624+ rows make real progress: once a row is fixed, `image`
     * no longer matches and it drops out of every future candidate page,
     * so `limit` (the job's work limit) always spends its budget on
     * unfinished rows instead of re-fetching already-done ones.
     */
    findRequiringRelink(limit: number): Promise<Screenshot[]>;

    /**
     * GDPR erasure (M9.7's `/privacidade apagar` command) — hard delete of
     * every screenshot row for this author. Returns the number of rows
     * removed, for the confirmation the member sees.
     */
    deleteAllByAuthor(authorId: string): Promise<number>;
}
