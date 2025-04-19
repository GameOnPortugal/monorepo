import type {Screenshot} from "./Screenshot.ts";
import type {ScreenshotId} from "./ScreenshotId.ts";

export interface ScreenshotRepository {
    save: (screenshot: Screenshot) => Promise<void>

    /**
     * @throws RecordNotFound
     */
    get(id: ScreenshotId): Promise<Screenshot>

    findByWeek(week: Date): Promise<Screenshot[]>

    delete(id: ScreenshotId): Promise<void>

    findByMd5(md5: string): Promise<Screenshot | null>

    findBy(userId: string | null): Promise<Screenshot[]>
}
