// Batch 7 (RS-4), cache riset: SQLite table research_cache, lintas project.
// TTL beda per kind (search 12 jam, halaman 72 jam), konsumen yang menentukan.
// dbPath kosong → fallback in-memory (tests / runtime tanpa disk).
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type CacheKind = "search" | "page" | "robots";

export interface ResearchCache {
  get<T>(key: string, ttlMs: number, now?: number): T | null;
  set(key: string, kind: CacheKind, value: unknown, now?: number): void;
}

interface Row {
  key: string;
  kind: string;
  payload: string;
  created_at: number;
}

class MemoryCache implements ResearchCache {
  private map = new Map<string, { kind: string; payload: string; created_at: number }>();
  get<T>(key: string, ttlMs: number, now = Date.now()): T | null {
    const row = this.map.get(key);
    if (!row || now - row.created_at > ttlMs) return null;
    return JSON.parse(row.payload) as T;
  }
  set(key: string, kind: CacheKind, value: unknown, now = Date.now()): void {
    this.map.set(key, { kind, payload: JSON.stringify(value), created_at: now });
  }
}

export class SqliteResearchCache implements ResearchCache {
  private db: Database.Database;
  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS research_cache (
         key TEXT PRIMARY KEY,
         kind TEXT NOT NULL,
         payload TEXT NOT NULL,
         created_at INTEGER NOT NULL
       )`,
    );
    // housekeeping sekali per konstruksi: buang yang kedaluwarsa 7 hari.
    this.db.prepare("DELETE FROM research_cache WHERE created_at < ?").run(Date.now() - 7 * 24 * 3600_000);
  }
  get<T>(key: string, ttlMs: number, now = Date.now()): T | null {
    const row = this.db.prepare("SELECT key, kind, payload, created_at FROM research_cache WHERE key = ?").get(key) as Row | undefined;
    if (!row || now - row.created_at > ttlMs) return null;
    return JSON.parse(row.payload) as T;
  }
  set(key: string, kind: CacheKind, value: unknown, now = Date.now()): void {
    this.db
      .prepare("INSERT INTO research_cache (key, kind, payload, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET kind = excluded.kind, payload = excluded.payload, created_at = excluded.created_at")
      .run(key, kind, JSON.stringify(value), now);
  }
  close(): void {
    this.db.close();
  }
}

export function newResearchCache(dbPath?: string): ResearchCache {
  return dbPath ? new SqliteResearchCache(dbPath) : new MemoryCache();
}
