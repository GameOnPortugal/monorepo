// S3-API adapter for MediaStorage, targeting the MinIO instance already
// deployed on HTZ1 (infrastructure/game-on-portugal.yaml — bucket
// `gop-media`, public-read, served at https://media.game-on-portugal.pt
// through Caddy). See Sigv4.ts for why this signs requests by hand instead
// of pulling in @aws-sdk/client-s3.
//
// Addressing: MinIO does not do virtual-hosted-style bucket routing without
// wildcard DNS, and this deployment doesn't have that, so every request is
// path-style: {endpoint}/{bucket}/{key}. Caddy proxies the public hostname
// straight through to the MinIO container with no path rewrite
// (infrastructure/caddy/game-on-portugal.pt.caddy), so the public URL is
// path-style too: {publicUrl}/{bucket}/{key}.
import { createHash } from 'crypto';
import type { MediaObject, MediaStorage } from '../../Domain/Media/MediaStorage';
import { signAwsRequestV4 } from './Sigv4';

export interface S3MediaStorageConfig {
    /** Internal endpoint the bot actually talks to, e.g. http://minio:9000. */
    endpoint: string;
    /** Public origin durable URLs are built from, e.g. https://media.game-on-portugal.pt. */
    publicUrl: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    /**
     * SigV4 requires a region even though MinIO doesn't really have one.
     * Defaults to "us-east-1", MinIO's own default signing region — override
     * with S3_REGION only if the stack ever sets MINIO_REGION explicitly.
     */
    region?: string;
}

type FetchFn = typeof fetch;

const DEFAULT_REGION = 'us-east-1';
const SERVICE = 's3';

export class S3MediaStorage implements MediaStorage {
    private readonly region: string;

    constructor(
        private readonly config: S3MediaStorageConfig,
        private readonly fetchFn: FetchFn = fetch,
    ) {
        this.region = config.region ?? DEFAULT_REGION;
    }

    async put(object: MediaObject): Promise<string> {
        const response = await this.signedRequest('PUT', object.key, object.body, {
            'content-type': object.contentType,
        });

        if (!response.ok) {
            throw new Error(
                `S3MediaStorage.put: PUT ${object.key} failed with status ${response.status}`,
            );
        }

        return this.publicUrlFor(object.key);
    }

    async exists(key: string): Promise<boolean> {
        const response = await this.signedRequest('HEAD', key);

        if (response.status === 404) {
            return false;
        }
        if (!response.ok) {
            throw new Error(
                `S3MediaStorage.exists: HEAD ${key} failed with status ${response.status}`,
            );
        }
        return true;
    }

    async delete(key: string): Promise<void> {
        const response = await this.signedRequest('DELETE', key);

        // Delete is idempotent by contract (MediaStorage.delete docs): a 404
        // means the object is already gone, which is the desired end state,
        // not a failure.
        if (!response.ok && response.status !== 404) {
            throw new Error(
                `S3MediaStorage.delete: DELETE ${key} failed with status ${response.status}`,
            );
        }
    }

    publicUrlFor(key: string): string {
        return `${trimTrailingSlash(this.config.publicUrl)}/${this.config.bucket}/${encodeKeyPath(key)}`;
    }

    private async signedRequest(
        method: 'PUT' | 'HEAD' | 'DELETE',
        key: string,
        body?: Uint8Array,
        extraHeaders: Record<string, string> = {},
    ): Promise<Response> {
        const endpoint = new URL(this.config.endpoint);
        const path = `/${this.config.bucket}/${encodeKeyPath(key)}`;
        const payloadHash = createHash('sha256')
            .update(body ?? new Uint8Array())
            .digest('hex');

        // S3 (unlike the generic AWS SigV4 test suite) requires
        // x-amz-content-sha256 to be sent and signed on every request, so it
        // goes in as an explicit header here rather than being auto-injected
        // by signAwsRequestV4 (see the comment there).
        const signed = signAwsRequestV4(
            {
                method,
                host: endpoint.host,
                path,
                region: this.region,
                service: SERVICE,
                date: new Date(),
                payloadHash,
                headers: { ...extraHeaders, 'x-amz-content-sha256': payloadHash },
            },
            { accessKeyId: this.config.accessKeyId, secretAccessKey: this.config.secretAccessKey },
        );

        return this.fetchFn(`${endpoint.origin}${path}`, {
            method,
            headers: {
                ...extraHeaders,
                'x-amz-date': signed['x-amz-date'],
                'x-amz-content-sha256': signed['x-amz-content-sha256'],
                authorization: signed.authorization,
            },
            body: method === 'PUT' ? new Uint8Array(body ?? new Uint8Array()) : undefined,
        });
    }
}

function trimTrailingSlash(value: string): string {
    return value.replace(/\/$/, '');
}

// S3 key paths encode every segment individually and never touch the "/"
// separators between them (a key like "ads/<uuid>/0.png" must keep its
// slashes as path separators, not become "ads%2F<uuid>%2F0.png").
function encodeKeyPath(key: string): string {
    return key
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
}
