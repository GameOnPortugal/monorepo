import type { MediaObject, MediaStorage } from '../../Domain/Media/MediaStorage';

// Bound to TYPES.MediaStorage when S3_* isn't configured (local dev, tests,
// CI) — same shape as InMemoryClient's fallback for a missing DISCORD_TOKEN
// (../Bot/InMemory/InMemoryClient.ts): the bot boots and stores objects
// in-process instead of crashing because a real MinIO isn't reachable
// everywhere the container starts.
export class InMemoryMediaStorage implements MediaStorage {
    private readonly objects = new Map<string, MediaObject>();

    async put(object: MediaObject): Promise<string> {
        this.objects.set(object.key, object);
        return `memory://${object.key}`;
    }

    async exists(key: string): Promise<boolean> {
        return this.objects.has(key);
    }

    async delete(key: string): Promise<void> {
        this.objects.delete(key);
    }
}
