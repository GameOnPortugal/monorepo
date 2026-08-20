import Transport from 'winston-transport';

interface LokiHttpTransportOptions extends Transport.TransportStreamOptions {
    host: string;
    basicAuth?: string;
    labels?: Record<string, string>;
}

/**
 * Minimal Winston transport that pushes logs straight to Loki's
 * `/loki/api/v1/push` JSON endpoint via native `fetch` (M3.5). Replaces
 * `winston-loki`, which dragged in `snappy` (13 prebuilt native binaries,
 * used only for the protobuf wire format this transport doesn't use — JSON
 * is explicit here) and `protobufjs` (five separate advisories) for what is
 * one optional, env-gated log sink.
 *
 * Deliberately does not batch, queue, retry, or register a process exit
 * hook the way winston-loki's Batcher did: a logging sink being unreachable
 * must never take the bot down, and pushing logs must never block process
 * exit. Every push is fire-and-forget — errors are swallowed (after being
 * logged to stderr) rather than surfaced or retried.
 */
export default class LokiHttpTransport extends Transport {
    private readonly url: string;
    private readonly headers: Record<string, string>;
    private readonly labels: Record<string, string>;

    constructor(options: LokiHttpTransportOptions) {
        super(options);

        this.url = `${options.host.replace(/\/+$/, '')}/loki/api/v1/push`;
        this.labels = options.labels ?? {};
        this.headers = { 'Content-Type': 'application/json' };

        if (options.basicAuth) {
            this.headers.Authorization = `Basic ${Buffer.from(options.basicAuth).toString('base64')}`;
        }
    }

    log(info: Record<string, any>, callback: () => void): void {
        setImmediate(() => this.emit('logged', info));

        const { level, message, timestamp, ...context } = info;
        const line = `${message}${Object.keys(context).length > 0 ? ' ' + JSON.stringify(context) : ''}`;
        const timestampMs = timestamp ? new Date(timestamp).getTime() : Date.now();
        const timestampNs = BigInt(timestampMs) * 1_000_000n;

        const body = JSON.stringify({
            streams: [
                {
                    stream: { ...this.labels, level },
                    values: [[timestampNs.toString(), line]],
                },
            ],
        });

        fetch(this.url, { method: 'POST', headers: this.headers, body }).catch((error) => {
            console.error('Failed to push log to Loki', error);
        });

        callback();
    }
}
