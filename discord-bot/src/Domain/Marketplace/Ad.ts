import { AdId } from './AdId';
import { AdStatus } from './AdStatus';
import { normalizeAdType } from './AdType';

export interface AdArray {
    id: string;
    name: string | null;
    author_id: string | null;
    channel_id: string | null;
    message_id: string | null;
    state: string;
    price: string | null;
    zone: string | null;
    dispatch: string | null;
    warranty: string | null;
    description: string | null;
    adType: string | null;
    status: string;
    price_cents: number | null;
    // Raw JSON text as stored (see the `images` field comment in schema.prisma
    // for why this is `@db.Text` rather than Prisma's `Json` type).
    images: string | null;
    bumped_at: Date | null;
    expires_at: Date | null;
    sold_at: Date | null;
    deleted_at: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * The `images` column stores a JSON-encoded array of strings (see the field
 * comment in schema.prisma for why it's `@db.Text` and not Prisma's `Json`
 * type). Tolerate NULL, malformed JSON and a non-array payload by falling
 * back to an empty list rather than throwing — a corrupt or unexpected value
 * in an optional, additive column should degrade the ad's images, not the ad.
 */
function parseImages(raw: string | null): string[] {
    if (raw === null) {
        return [];
    }

    try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed)
            ? parsed.filter((entry): entry is string => typeof entry === 'string')
            : [];
    } catch {
        return [];
    }
}

/** The inverse of {@link parseImages}, for writing the column back. */
export function serializeImages(images: string[]): string | null {
    return images.length > 0 ? JSON.stringify(images) : null;
}

export class Ad {
    public readonly adType: string | null;

    constructor(
        public readonly id: AdId,
        public readonly name: string | null,
        public readonly authorId: string | null,
        public readonly channelId: string | null,
        public readonly messageId: string | null,
        public readonly state: string,
        public readonly price: string | null,
        public readonly zone: string | null,
        public readonly dispatch: string | null,
        public readonly warranty: string | null,
        public readonly description: string | null,
        adType: string | null,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly status: AdStatus = AdStatus.active(),
        public readonly priceCents: number | null = null,
        public readonly images: string[] = [],
        public readonly bumpedAt: Date | null = null,
        public readonly expiresAt: Date | null = null,
        public readonly soldAt: Date | null = null,
        public readonly deletedAt: Date | null = null,
    ) {
        // Normalise here, not at each call site — see AdType.ts. This is the
        // one place every Ad in the system is constructed, so it is the one
        // place that guarantees 'sale' can never reach the database again.
        this.adType = normalizeAdType(adType);
    }

    public static fromArray(array: AdArray): Ad {
        return new Ad(
            AdId.fromString(array.id),
            array.name,
            array.author_id,
            array.channel_id,
            array.message_id,
            array.state,
            array.price,
            array.zone,
            array.dispatch,
            array.warranty,
            array.description,
            array.adType,
            array.createdAt,
            array.updatedAt,
            AdStatus.fromString(array.status),
            array.price_cents,
            parseImages(array.images),
            array.bumped_at,
            array.expires_at,
            array.sold_at,
            array.deleted_at,
        );
    }

    /**
     * Returns a new `Ad` with the given fields replaced — everything else,
     * including `id`, carried over unchanged. `Ad` has no other mutation
     * surface (every field is `readonly`), so a lifecycle transition (M6.5's
     * active → pending_renewal → expired/active) or a sold/bump/edit
     * transition (M5.6) would otherwise mean re-listing all twenty-one
     * constructor arguments at every call site — exactly the kind of
     * copy-paste that silently drops a field on the next one added.
     *
     * `updatedAt` defaults to "now" on every call, matching Prisma's
     * `@updatedAt` semantics for the column it maps to. Keys are tested with
     * `in` rather than `??`/`?.` so a caller can deliberately set a field
     * back to `null` (e.g. clearing `bumpedAt`) without that being
     * indistinguishable from "leave it alone".
     *
     * The mutable-field list is the union of what M5.6 and M6.5 each need:
     * the two landed in parallel as `withChanges` and `withChanges`, two
     * near-identical methods differing only in which fields they let through.
     * Merged into one at integration rather than kept as a pair — two
     * spellings of "copy this entity with edits" is precisely how a field
     * ends up updatable through one path and silently ignored through the
     * other.
     */
    public withChanges(
        changes: Partial<{
            channelId: string | null;
            messageId: string | null;
            status: AdStatus;
            price: string | null;
            priceCents: number | null;
            description: string | null;
            bumpedAt: Date | null;
            expiresAt: Date | null;
            soldAt: Date | null;
            deletedAt: Date | null;
            updatedAt: Date;
        }>,
    ): Ad {
        return new Ad(
            this.id,
            this.name,
            this.authorId,
            'channelId' in changes ? (changes.channelId ?? null) : this.channelId,
            'messageId' in changes ? (changes.messageId ?? null) : this.messageId,
            this.state,
            'price' in changes ? (changes.price ?? null) : this.price,
            this.zone,
            this.dispatch,
            this.warranty,
            'description' in changes ? (changes.description ?? null) : this.description,
            this.adType,
            this.createdAt,
            changes.updatedAt ?? new Date(),
            changes.status ?? this.status,
            'priceCents' in changes ? (changes.priceCents ?? null) : this.priceCents,
            this.images,
            'bumpedAt' in changes ? (changes.bumpedAt ?? null) : this.bumpedAt,
            'expiresAt' in changes ? (changes.expiresAt ?? null) : this.expiresAt,
            'soldAt' in changes ? (changes.soldAt ?? null) : this.soldAt,
            'deletedAt' in changes ? (changes.deletedAt ?? null) : this.deletedAt,
        );
    }
}
