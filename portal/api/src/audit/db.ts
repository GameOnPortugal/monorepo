// M8.11 — the audit log's storage.
//
// Why not a MySQL table: "the bot owns the database schema... if the audit
// log needs a table, that is a discord-bot/prisma migration you cannot make.
// Prefer a design that does not need one" (this milestone's task brief,
// mirrored in docs/plans/GLOBAL-PLAN.md's M8.11 row). It genuinely needs
// *somewhere* durable to live — "who changed what" is worthless if it does
// not survive a redeploy — so this uses a private SQLite file that portal-api
// owns outright, via Bun's built-in `bun:sqlite` (zero new dependency).
// Nothing here touches `discord-bot/prisma/schema.prisma` or the bot's MySQL
// database, and the bot's own `prisma migrate deploy` on boot has no way to
// know this file exists, so there is no collision risk in either direction.
//
// Persistence: `AUDIT_DB_PATH` (default `./data/audit.db`, relative to
// portal/api's cwd) is a Docker volume in infrastructure/game-on-portugal.yaml
// (`portal_audit_data`) — see that file's portal-api service. Local dev and
// tests default to a throwaway path under the OS temp dir unless overridden,
// so `bun test` never depends on `./data` existing or being writable in CI.
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface AuditLogEntry {
  id: number;
  at: string; // ISO 8601
  adminId: string;
  adminUsername: string;
  action: string; // e.g. "ad.expire", "screenshot.delete", "trophyProfile.setBanned"
  entityType: string; // "ad" | "screenshot" | "trophyProfile"
  entityId: string;
  detail: string | null; // free-form JSON, e.g. { before, after }
}

export type NewAuditLogEntry = Omit<AuditLogEntry, "id" | "at">;

let db: Database | undefined;

function resolveDbPath(): string {
  return process.env.AUDIT_DB_PATH ?? "./data/audit.db";
}

/** Lazily opened so importing this module never has a file-system side effect. */
function getDb(): Database {
  if (db) return db;

  const path = resolveDbPath();
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      admin_id TEXT NOT NULL,
      admin_username TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      detail TEXT
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS audit_log_entity ON audit_log(entity_type, entity_id)");
  db.exec("CREATE INDEX IF NOT EXISTS audit_log_at ON audit_log(at DESC)");
  return db;
}

/** Test-only: force a fresh in-memory (or path-overridden) database on next access. */
export function resetAuditDbForTests(): void {
  db?.close();
  db = undefined;
}

export function recordAuditEntry(entry: NewAuditLogEntry): AuditLogEntry {
  const at = new Date().toISOString();
  const result = getDb()
    .query(
      `INSERT INTO audit_log (at, admin_id, admin_username, action, entity_type, entity_id, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(at, entry.adminId, entry.adminUsername, entry.action, entry.entityType, entry.entityId, entry.detail);

  return { id: Number(result.lastInsertRowid), at, ...entry };
}

export interface ListAuditLogFilters {
  entityType?: string;
  limit: number;
  offset: number;
}

export function listAuditLog(filters: ListAuditLogFilters): AuditLogEntry[] {
  const where = filters.entityType ? "WHERE entity_type = ?" : "";
  const params = filters.entityType
    ? [filters.entityType, filters.limit, filters.offset]
    : [filters.limit, filters.offset];

  const rows = getDb()
    .query(
      `SELECT id, at, admin_id AS adminId, admin_username AS adminUsername, action,
              entity_type AS entityType, entity_id AS entityId, detail
       FROM audit_log
       ${where}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params) as AuditLogEntry[];

  return rows;
}

export function countAuditLog(filters: Pick<ListAuditLogFilters, "entityType">): number {
  const where = filters.entityType ? "WHERE entity_type = ?" : "";
  const params = filters.entityType ? [filters.entityType] : [];
  const row = getDb()
    .query(`SELECT COUNT(*) AS count FROM audit_log ${where}`)
    .get(...params) as { count: number };
  return row.count;
}
