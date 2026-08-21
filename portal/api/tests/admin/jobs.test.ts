import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { buildApp } from "../../src/app";
import { prisma } from "../../src/db";
import { adminCookie, uniqueId } from "../helpers";

const app = buildApp();
const cookie = adminCookie();

// M8.12 — job_runs is written by the bot's in-process scheduler (M6.1); this
// suite only ever reads it (repositories/admin/jobs.ts's header explains why
// there is no "trigger" endpoint).
let jobName: string;

beforeAll(async () => {
  jobName = uniqueId("test-job");
  await prisma.jobRun.create({
    data: {
      id: uniqueId("test-jobrun"),
      job_name: jobName,
      last_run_at: new Date(),
      status: "success",
      summary: "did the thing",
    },
  });
});

afterAll(async () => {
  await prisma.jobRun.deleteMany({ where: { job_name: jobName } });
});

describe("GET /api/admin/jobs", () => {
  test("requires admin auth", async () => {
    const res = await app.request("/api/admin/jobs");
    expect(res.status).toBe(401);
  });

  test("reads real job_runs rows", async () => {
    const res = await app.request("/api/admin/jobs", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { jobs: Array<{ jobName: string; status: string; summary: string | null }> };
    const found = body.jobs.find((j) => j.jobName === jobName);
    expect(found).toBeDefined();
    expect(found?.status).toBe("success");
    expect(found?.summary).toBe("did the thing");
  });
});

describe("GET /api/admin/dashboard", () => {
  test("includes job runs alongside counts and recent audit activity", async () => {
    const res = await app.request("/api/admin/dashboard", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ads: Record<string, number>;
      screenshots: number;
      trophyProfiles: number;
      jobs: Array<{ jobName: string }>;
      recentAudit: unknown[];
    };
    expect(typeof body.screenshots).toBe("number");
    expect(typeof body.trophyProfiles).toBe("number");
    expect(body.jobs.some((j) => j.jobName === jobName)).toBe(true);
    expect(Array.isArray(body.recentAudit)).toBe(true);
  });
});
