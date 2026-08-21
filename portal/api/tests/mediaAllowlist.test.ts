import { describe, expect, test } from "bun:test";
import { MediaUrlRejected, validateMediaUrl } from "../src/lib/mediaAllowlist";

// Pure-function coverage for the SSRF guard the thumbnail endpoint relies on
// (see that file's header for why this exists as its own module rather than
// importing discord-bot's DiscordCdnAllowlist).
describe("validateMediaUrl", () => {
  test("accepts a real gop-media screenshot URL and strips the query string", () => {
    const url = validateMediaUrl("https://media.game-on-portugal.pt/gop-media/screenshots/abc.jpg?x=1&y=2");
    expect(url.toString()).toBe("https://media.game-on-portugal.pt/gop-media/screenshots/abc.jpg");
  });

  test("rejects a non-allowlisted host", () => {
    expect(() => validateMediaUrl("https://evil.example.com/gop-media/screenshots/abc.jpg")).toThrow(
      MediaUrlRejected,
    );
  });

  test("rejects the same host's MinIO console path (only the bucket prefix is allowed)", () => {
    expect(() => validateMediaUrl("https://media.game-on-portugal.pt/console")).toThrow(MediaUrlRejected);
  });

  test("rejects http (non-TLS)", () => {
    expect(() => validateMediaUrl("http://media.game-on-portugal.pt/gop-media/screenshots/abc.jpg")).toThrow(
      MediaUrlRejected,
    );
  });

  test("rejects a disallowed extension", () => {
    expect(() => validateMediaUrl("https://media.game-on-portugal.pt/gop-media/screenshots/abc.svg")).toThrow(
      MediaUrlRejected,
    );
  });

  test("rejects a malformed URL rather than throwing an unhandled error", () => {
    expect(() => validateMediaUrl("not-a-url")).toThrow(MediaUrlRejected);
  });

  test("accepts every allowed extension", () => {
    for (const ext of [".jpg", ".jpeg", ".png", ".webp", ".gif"]) {
      expect(() => validateMediaUrl(`https://media.game-on-portugal.pt/gop-media/screenshots/abc${ext}`)).not.toThrow();
    }
  });

  test("SSRF: a host allowlist bypass attempt via userinfo/path tricks still fails", () => {
    // e.g. "https://media.game-on-portugal.pt@evil.example.com/x.jpg" — the
    // WHATWG URL parser resolves hostname to evil.example.com here, which
    // the allowlist correctly rejects (this test exists to pin that down,
    // not because URL's own parser needed help).
    expect(() =>
      validateMediaUrl("https://media.game-on-portugal.pt@evil.example.com/gop-media/screenshots/abc.jpg"),
    ).toThrow(MediaUrlRejected);
  });
});
