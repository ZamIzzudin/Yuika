// @yuika/api, auth store (SQLite, separate from sessions). Portal-only:
// - No credentials here: accounts and signup live in yuika-portal;
//   local users are created automatically on the first SSO sign-in.
// - User identity = portal_account_id (from the portal code exchange).
// - Session tokens: random 32B (base64url) sent to the client; only the
//   hash-nya (bocor DB ≠ token bisa dipakai). TTL 30 hari, expired dipurge.
// - Mode terbuka: selama tabel users kosong, API terbuka (self-hosted solo
//   ala Gitea), user pertama lahir dari portal sign-in pertama, setelah itu
//   SEMUA route non-auth wajib Bearer token (lihat middleware di app.ts).
// DB path: env YUI_AUTH_DB || <repo>/auth.db (tergitignore via *.db).
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { resolveRepoRoot } from "@yuika/core";

const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000;

export interface AuthUserRecord {
  id: string;
  email: string;
}

let db: Database.Database | null = null;

/** Kolom opsional (migrasi ringan idempoten). */
function ensureColumn(d: Database.Database, table: string, col: string, ddl: string): void {
  const cols = d.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === col)) d.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

function open(): Database.Database {
  db ??= (() => {
    const file = process.env.YUI_AUTH_DB || path.join(resolveRepoRoot(), "auth.db");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const d = new Database(file);
    d.pragma("journal_mode = WAL");
    d.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS auth_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
    `);
    // SSO: user identity = portal_account_id (unique, nullable for legacy
    // pre-migration local users that can no longer log in; data stays).
    // password_hash is kept only for old-schema compatibility; the
    // "!portal-only" sentinel is never verified (local login is gone).
    ensureColumn(d, "users", "portal_account_id", "portal_account_id TEXT");
    d.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_portal ON users(portal_account_id) WHERE portal_account_id IS NOT NULL");
    return d;
  })();
  return db;
}

/** Jumlah user terdaftar, 0 berarti mode terbuka (API terbuka). */
export function authUserCount(): number {
  const row = open().prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  return row.n;
}

/** Buat sesi: return token (plain, untuk klien). */
export function createSession(userId: string): string {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  open().prepare("INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    sha(token),
    userId,
    now,
    now + TOKEN_TTL_MS,
  );
  open().prepare("DELETE FROM auth_sessions WHERE expires_at < ?").run(now);
  return token;
}

/** Validasi token → user, atau null (tak ada/kedaluwarsa). */
export function validateToken(token: string): AuthUserRecord | null {
  const row = open()
    .prepare(
      `SELECT u.id AS id, u.email AS email, s.expires_at AS expires_at
         FROM auth_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?`,
    )
    .get(sha(token)) as { id: string; email: string; expires_at: number } | undefined;
  if (!row || row.expires_at < Date.now()) return null;
  return { id: row.id, email: row.email };
}

/** Hapus sesi (logout). */
export function deleteSession(token: string): void {
  open().prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(sha(token));
}

/** Sign out every session of one portal account; used when the web
 *  device is unlinked from the portal (bye 4001): web sessions are revoked,
 *  the next login auto-links again via deviceToken. */
export function signOutPortalAccount(portalAccountId: string): number {
  const r = open()
    .prepare(
      `DELETE FROM auth_sessions WHERE user_id IN
        (SELECT id FROM users WHERE portal_account_id = ?)`,
    )
    .run(portalAccountId);
  return r.changes;
}

// ── SSO: find-or-create user from the portal identity ────────────────────

/** Email already belongs to another portal account: rejection, not takeover. */
export class PortalLinkConflictError extends Error {
  constructor(email: string) {
    super(`email ${email} already belongs to another portal account`);
  }
}

/**
 * Portal login: identity = portalAccountId. Another portal account using
 * the same email is rejected (anti takeover; portal emails are unique).
 * Exception: legacy pre-portal users (NULL portal_account_id) with the
 * same email get linked once (the portal guarantees email ownership).
 */
export function findOrCreatePortalUser(portalAccountId: string, email: string): AuthUserRecord {
  const d = open();
  const norm = email.trim().toLowerCase();
  const byPortal = d.prepare("SELECT id, email FROM users WHERE portal_account_id = ?").get(portalAccountId) as
    | { id: string; email: string }
    | undefined;
  if (byPortal) return byPortal;
  const byEmail = d.prepare("SELECT id, email, portal_account_id AS pid FROM users WHERE email = ?").get(norm) as
    | { id: string; email: string; pid: string | null }
    | undefined;
  if (byEmail) {
    if (byEmail.pid && byEmail.pid !== portalAccountId) throw new PortalLinkConflictError(norm);
    // user legacy lokal (pid NULL) → migrasi: kaitkan sekali ke akun portal ini
    d.prepare("UPDATE users SET portal_account_id = ? WHERE id = ?").run(portalAccountId, byEmail.id);
    return { id: byEmail.id, email: byEmail.email };
  }
  const id = `u_${randomBytes(8).toString("hex")}`;
  d.prepare("INSERT INTO users (id, email, password_hash, created_at, portal_account_id) VALUES (?, ?, ?, ?, ?)").run(
    id,
    norm,
    "!portal-only",
    Date.now(),
    portalAccountId,
  );
  return { id, email: norm };
}

function sha(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Test helper: tutup koneksi + reset singleton (isolasi antar suite). */
export function _resetAuthForTests(): void {
  db?.close();
  db = null;
}
