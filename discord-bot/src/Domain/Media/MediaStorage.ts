// The durable-storage port for images the bot has to keep long-term
// (screenshots, marketplace photos, ...). See docs/plans/GLOBAL-PLAN.md M6.0
// and cross-cutting rule 3: a Discord CDN attachment URL is signed and
// expires within 24h, so it must never be the thing this port hands back —
// every implementation returns a durable, unauthenticated public URL instead.
// That rule is the entire reason all 624 historical screenshots 404 today.
//
// Deliberately narrower than "whatever S3 offers":
//
// - `put` takes fully-buffered bytes, not a stream. A correct AWS SigV4
//   signature needs a SHA-256 of the whole payload up front (or the far more
//   involved chunked-signing flow, which this port does not implement).
//   Every current and planned caller (re-hosted screenshots, marketplace
//   photos) already has to buffer a capped-size image in memory before it
//   has anything to store — see SafeImageFetcher in ../../Infrastructure/Media,
//   which enforces that cap on the way in. So a stream parameter here would
//   be unused surface area. Revisit if a caller ever needs to store
//   something too large to buffer whole.
// - `exists` is here purely so a re-hosting job (M6.3) can be re-run without
//   re-uploading (and re-signing) objects it already wrote — the key scheme
//   in MediaKey.ts is stable specifically so this check is meaningful.
// - There is no `get`/read-back method: nothing in the bot needs to read an
//   object back out of storage, only to learn its public URL (returned by
//   `put`) or whether it is already there.
// - No soft-delete here: soft-delete is a database-row concept (cross-cutting
//   rule 2), not a storage one. The object itself is fine to hard-delete;
//   callers are responsible for not calling `delete` on an object a
//   soft-deleted row should still display.

export interface MediaObject {
    /** Caller-chosen, storage-relative key. See MediaKey.ts for the naming scheme. */
    key: string;
    body: Uint8Array;
    contentType: string;
}

export interface MediaStorage {
    /** Uploads the object and returns its durable, public URL. */
    put(object: MediaObject): Promise<string>;

    /** True if `key` has already been written — lets a re-host job skip re-uploading. */
    exists(key: string): Promise<boolean>;

    /** Removes the object. Not an error if it is already gone (delete is idempotent). */
    delete(key: string): Promise<void>;
}
