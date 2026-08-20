import { describe, test, expect } from 'bun:test';
import {
    signAwsRequestV4,
    EMPTY_PAYLOAD_SHA256,
} from '../../../../src/Infrastructure/Media/Sigv4.ts';

describe('signAwsRequestV4', () => {
    // Known-answer test against AWS's own published SigV4 test suite
    // ("get-vanilla"), fetched verbatim from
    // https://github.com/boto/botocore/tree/develop/tests/unit/auth/aws4_testsuite
    // (originally https://github.com/awslabs/aws-c-auth aws-sig-v4-test-suite)
    // and independently re-derived by hand from
    // https://docs.aws.amazon.com/general/latest/gr/sigv4-signed-request-examples.html
    // before being pinned here — a silently wrong signature is the actual
    // failure mode of a hand-rolled signer (every request just fails closed
    // with 403), so this is the one test in this PR that must not be
    // "close enough".
    //
    // get-vanilla.creq:
    //   GET
    //   /
    //   <empty query>
    //   host:example.amazonaws.com
    //   x-amz-date:20150830T123600Z
    //   <empty line>
    //   host;x-amz-date
    //   e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    //
    // get-vanilla.sts:
    //   AWS4-HMAC-SHA256
    //   20150830T123600Z
    //   20150830/us-east-1/service/aws4_request
    //   bb579772317eb040ac9ed261061d46c1f17a8133879d6129b6e1c25292927e63
    //
    // get-vanilla.authz:
    //   AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request,
    //   SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31
    test('matches the AWS SigV4 "get-vanilla" test vector', () => {
        const signed = signAwsRequestV4(
            {
                method: 'GET',
                host: 'example.amazonaws.com',
                path: '/',
                region: 'us-east-1',
                service: 'service',
                date: new Date('2015-08-30T12:36:00Z'),
                payloadHash: EMPTY_PAYLOAD_SHA256,
            },
            {
                accessKeyId: 'AKIDEXAMPLE',
                // The botocore test-suite runner (test_sigv4.py) pins this exact
                // secret for every fixture in aws4_testsuite/, including get-vanilla.
                secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
            },
        );

        expect(signed['x-amz-date']).toBe('20150830T123600Z');
        expect(signed['x-amz-content-sha256']).toBe(
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        );
        expect(signed.authorization).toBe(
            'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, ' +
                'SignedHeaders=host;x-amz-date, ' +
                'Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
        );
    });

    test('a different payload hash changes the signature', () => {
        const base = {
            method: 'GET',
            host: 'example.amazonaws.com',
            path: '/',
            region: 'us-east-1',
            service: 'service',
            date: new Date('2015-08-30T12:36:00Z'),
        };
        const credentials = {
            accessKeyId: 'AKIDEXAMPLE',
            secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
        };

        const empty = signAwsRequestV4({ ...base, payloadHash: EMPTY_PAYLOAD_SHA256 }, credentials);
        const nonEmpty = signAwsRequestV4({ ...base, payloadHash: 'a'.repeat(64) }, credentials);

        expect(empty.authorization).not.toBe(nonEmpty.authorization);
    });

    test('extra signed headers (e.g. content-type) are included in SignedHeaders', () => {
        const signed = signAwsRequestV4(
            {
                method: 'PUT',
                host: 'minio:9000',
                path: '/gop-media/screenshots/x.png',
                region: 'us-east-1',
                service: 's3',
                date: new Date('2015-08-30T12:36:00Z'),
                payloadHash: EMPTY_PAYLOAD_SHA256,
                headers: { 'content-type': 'image/png' },
            },
            {
                accessKeyId: 'AKIDEXAMPLE',
                secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
            },
        );

        expect(signed.authorization).toContain('SignedHeaders=content-type;host;x-amz-date');
    });

    // x-amz-content-sha256 is not auto-injected as a signed header (the
    // generic test vector above never sends it), but S3MediaStorage passes
    // it explicitly via `headers` because S3 requires it — this pins that
    // usage so a future refactor can't silently drop it from S3 requests.
    test('x-amz-content-sha256 is signed when the caller passes it explicitly (S3MediaStorage does)', () => {
        const signed = signAwsRequestV4(
            {
                method: 'PUT',
                host: 'minio:9000',
                path: '/gop-media/screenshots/x.png',
                region: 'us-east-1',
                service: 's3',
                date: new Date('2015-08-30T12:36:00Z'),
                payloadHash: EMPTY_PAYLOAD_SHA256,
                headers: {
                    'content-type': 'image/png',
                    'x-amz-content-sha256': EMPTY_PAYLOAD_SHA256,
                },
            },
            {
                accessKeyId: 'AKIDEXAMPLE',
                secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
            },
        );

        expect(signed.authorization).toContain(
            'SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date',
        );
    });
});
