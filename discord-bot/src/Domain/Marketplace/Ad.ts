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
     * including `id`, is carried over unchanged. `Ad` is otherwise immutable
     * (every field is `readonly`), so a lifecycle transition (M6.5's
     * active → pending_renewal → expired/active) would otherwise mean
     * re-listing all twenty-one constructor arguments at every call site,
     * which is exactly the kind of copy-paste that silently drops a field.
     * `updatedAt` defaults to "now" on every call, matching Prisma's
     * `@updatedAt` semantics for the column it's mapped to.
     */
    public withChanges(
        changes: Partial<{
            channelId: string | null;
            messageId: string | null;
            status: AdStatus;
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
            this.price,
            this.zone,
            this.dispatch,
            this.warranty,
            this.description,
            this.adType,
            this.createdAt,
            changes.updatedAt ?? new Date(),
            changes.status ?? this.status,
            this.priceCents,
            this.images,
            'bumpedAt' in changes ? (changes.bumpedAt ?? null) : this.bumpedAt,
            'expiresAt' in changes ? (changes.expiresAt ?? null) : this.expiresAt,
            'soldAt' in changes ? (changes.soldAt ?? null) : this.soldAt,
            'deletedAt' in changes ? (changes.deletedAt ?? null) : this.deletedAt,
        );
    }
}
