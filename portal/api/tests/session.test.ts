import { describe, expect, test } from "bun:test";
import { decodeSession, encodeSession } from "../src/lib/session";

const SECRET = "unit-test-secret";

describe("session sign/verify", () => {
  test("round-trips a valid session", () => {
    const session = { sub: "123", username: "luis", avatar: null, exp: Date.now() + 60_000 };
    const token = encodeSession(session, SECRET);
    expect(decodeSession(token, SECRET)).toEqual(session);
  });

  test("rejects a token signed with a different secret", () => {
    const session = { sub: "123", username: "luis", avatar: null, exp: Date.now() + 60_000 };
    const token = encodeSession(session, SECRET);
    expect(decodeSession(token, "a-different-secret")).toBeNull();
  });

  test("rejects a tampered payload (signature no longer matches)", () => {
    const session = { sub: "123", username: "luis", avatar: null, exp: Date.now() + 60_000 };
    const token = encodeSession(session, SECRET);
    const [payload, signature] = token.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ ...session, sub: "attacker" })).toString("base64url");
    expect(decodeSession(`${tamperedPayload}.${signature}`, SECRET)).toBeNull();
    void payload;
  });

  test("rejects an expired session", () => {
    const session = { sub: "123", username: "luis", avatar: null, exp: Date.now() - 1 };
    const token = encodeSession(session, SECRET);
    expect(decodeSession(token, SECRET)).toBeNull();
  });

  test("rejects missing/malformed tokens without throwing", () => {
    expect(decodeSession(undefined, SECRET)).toBeNull();
    expect(decodeSession(null, SECRET)).toBeNull();
    expect(decodeSession("", SECRET)).toBeNull();
    expect(decodeSession("not-a-valid-token", SECRET)).toBeNull();
    expect(decodeSession("no-dot-separator", SECRET)).toBeNull();
  });
});
