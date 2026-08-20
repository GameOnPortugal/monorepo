// AWS Signature Version 4 for simple, single-shot requests (PUT/HEAD/DELETE
// of a whole object already in memory). MinIO speaks the same S3 API and
// verifies the same signature.
//
// Dependency decision (see the PR body for the full argument): this repo
// just finished a dependency-currency pass (M3) that dropped axios and
// winston-loki specifically to shrink the tree, and `bun audit
// --audit-level=high` is a blocking CI gate. @aws-sdk/client-s3 is large and
// pulls a lot of transitive packages for what amounts to three HTTP verbs.
// SigV4 for this restricted case — no multipart, no chunked/streamed
// signing, no query-string presigning — is small and completely specified;
// hand-rolling it here needs no new dependency and keeps the audit surface
// flat. It is verified against AWS's own published test vector in
// Sigv4.test.ts, because a silently wrong signature is the actual failure
// mode of getting this wrong (every request fails closed with 403, not with
// a compile error).
//
// Reference: https://docs.aws.amazon.com/general/latest/gr/sigv4-signed-request-examples.html
import { createHash, createHmac } from 'crypto';

export interface SigV4Credentials {
    accessKeyId: string;
    secretAccessKey: string;
}

export interface SigV4RequestToSign {
    method: string;
    /** Host header value, including port if non-default (e.g. "minio:9000"). */
    host: string;
    /** Absolute path, already percent-encoded per segment, starting with "/". No query string support — none of our callers need one. */
    path: string;
    region: string;
    service: string;
    date: Date;
    /** Hex-encoded SHA-256 of the request body (sha256('') for an empty body). */
    payloadHash: string;
    /** Extra headers to include in the signature, e.g. { 'content-type': 'image/png' }. Keys are case-insensitive. */
    headers?: Record<string, string>;
}

export interface SigV4SignedHeaders {
    host: string;
    'x-amz-date': string;
    'x-amz-content-sha256': string;
    authorization: string;
}

function amzDate(date: Date): string {
    // "2015-08-30T12:36:00.000Z" -> "20150830T123600Z"
    return date
        .toISOString()
        .replace(/[:-]/g, '')
        .replace(/\.\d{3}/, '');
}

function sha256Hex(data: string | Uint8Array): string {
    return createHash('sha256').update(data).digest('hex');
}

function hmac(key: Uint8Array | string, data: string): Buffer {
    return createHmac('sha256', key).update(data, 'utf8').digest();
}

function deriveSigningKey(
    secretAccessKey: string,
    dateStamp: string,
    region: string,
    service: string,
): Buffer {
    const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, service);
    return hmac(kService, 'aws4_request');
}

export function signAwsRequestV4(
    request: SigV4RequestToSign,
    credentials: SigV4Credentials,
): SigV4SignedHeaders {
    const date = amzDate(request.date);
    const dateStamp = date.slice(0, 8);

    // `payloadHash` always goes into the canonical request's last line (the
    // hashed payload), whether or not it is also sent — and signed — as the
    // x-amz-content-sha256 *header*. The two are separate: AWS's generic
    // test suite (below) never sends that header at all, while S3 requires
    // it; S3MediaStorage passes it explicitly via `headers` for that reason
    // rather than it being injected here unconditionally.
    const headersToSign: Record<string, string> = {
        host: request.host,
        'x-amz-date': date,
    };
    for (const [name, value] of Object.entries(request.headers ?? {})) {
        headersToSign[name.toLowerCase()] = value;
    }

    const sortedHeaderNames = Object.keys(headersToSign).sort();
    const canonicalHeaders = sortedHeaderNames
        .map((name) => `${name}:${headersToSign[name]!.trim()}\n`)
        .join('');
    const signedHeaders = sortedHeaderNames.join(';');

    const canonicalRequest = [
        request.method.toUpperCase(),
        request.path,
        '', // canonical query string — none of our callers send one
        canonicalHeaders,
        signedHeaders,
        request.payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${request.region}/${request.service}/aws4_request`;
    const stringToSign = [
        'AWS4-HMAC-SHA256',
        date,
        credentialScope,
        sha256Hex(canonicalRequest),
    ].join('\n');

    const signingKey = deriveSigningKey(
        credentials.secretAccessKey,
        dateStamp,
        request.region,
        request.service,
    );
    const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

    const authorization =
        `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
        host: request.host,
        'x-amz-date': date,
        'x-amz-content-sha256': request.payloadHash,
        authorization,
    };
}

export function sha256HexOf(data: Uint8Array): string {
    return sha256Hex(data);
}

export const EMPTY_PAYLOAD_SHA256 = sha256Hex('');
