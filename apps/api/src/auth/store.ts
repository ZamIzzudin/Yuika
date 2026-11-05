// @yuika/api — P1-INF-1: auth store (SQLite terpisah dari sesi).
// - Password: scrypt (salt acak per user) + timingSafeEqual saat verify.
// - Token sesi: random 32B (base64url) dikirim ke klien; di DB hanya SHA-256
//   hash-nya (bocor DB ≠ token bisa dipakai). TTL 30 hari, expired dipurge.
// - Mode lokal: selama tabel users kosong, API terbuka (self-hosted single
//   user ala Gitea) — setelah user pertama mendaftar, SEMUA route non-auth
//   wajib Bearer token (lihat middleware di app.ts).
// DB path: env YUI_AUTH_DB || <repo>/auth.db (tergitignore via *.db).
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
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
    return d;
  })();
  return db;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: "EMAIL_TAKEN" | "INVALID_CREDENTIALS",
  ) {
    super(message);
  }
}

/** Jumlah user terdaftar — 0 berarti mode lokal (API terbuka). */
export function authUserCount(): number {
  const row = open().prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  return row.n;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64);
  return `s1$${salt.toString("hex")}$${key.toString("hex")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [v, saltHex, hashHex] = stored.split("$");
  if (v !== "s1" || !saltHex || !hashHex) return false;
  const expect = Buffer.from(hashHex, "hex");
  const got = scryptSync(password, Buffer.from(saltHex, "hex"), expect.length);
  return timingSafeEqual(expect, got);
}

/** Daftar user baru; email unik (case-insensitive). */
export function createUser(email: string, password: string): AuthUserRecord {
  const d = open();
  try {
    const id = `u_${randomBytes(8).toString("hex")}`;
    d.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)").run(
      id,
      email.trim().toLowerCase(),
      hashPassword(password),
      Date.now(),
    );
    return { id, email: email.trim().toLowerCase() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE")) throw new AuthError("email already registered", "EMAIL_TAKEN");
    throw e;
  }
}

/** Verifikasi kredensial → user record, atau null (email/password salah). */
export function verifyUser(email: string, password: string): AuthUserRecord | null {
  const row = open().prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(
    email.trim().toLowerCase(),
  ) as { id: string; email: string; password_hash: string } | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  return { id: row.id, email: row.email };
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

function sha(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Test helper: tutup koneksi + reset singleton (isolasi antar suite). */
export function _resetAuthForTests(): void {
  db?.close();
  db = null;
}
