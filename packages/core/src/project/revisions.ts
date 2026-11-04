// @yui/core — file revision store (P2-STU-3): snapshot isi LAMA sebelum write_file
// menimpa. Satu DB dengan sesi (tabel sendiri); cap 20 revisi per file, konten
// ≤256 KB per revisi (di luar itu revisi tidak direkam — file terlalu besar untuk diff).
import Database from "better-sqlite3";

export interface FileRevision {
  rev: number;
  path: string;
  bytes: number;
  createdAt: number;
}

const KEEP_PER_FILE = 20;
const MAX_BYTES = 256 * 1024;

export class FileRevisionStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`CREATE TABLE IF NOT EXISTS file_revisions (
      rev INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`);
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_file_rev_path ON file_revisions(path, rev)");
  }

  /** Rekam isi lama (dipanggil write_file SEBELUM menimpa). */
  saveRevision(absPath: string, oldContent: string): FileRevision | null {
    if (oldContent.length > MAX_BYTES) return null; // terlalu besar untuk diff — skip
    const r = this.db
      .prepare("INSERT INTO file_revisions (path, content, created_at) VALUES (?, ?, ?)")
      .run(absPath, oldContent, Date.now());
    // pangkas: simpan hanya KEEP_PER_FILE terakhir per path
    this.db
      .prepare(
        `DELETE FROM file_revisions WHERE path = ? AND rev NOT IN (
           SELECT rev FROM file_revisions WHERE path = ? ORDER BY rev DESC LIMIT ?)`,
      )
      .run(absPath, absPath, KEEP_PER_FILE);
    return { rev: Number(r.lastInsertRowid), path: absPath, bytes: oldContent.length, createdAt: Date.now() };
  }

  listRevisions(absPath: string): FileRevision[] {
    return (
      this.db
        .prepare("SELECT rev, path, created_at, length(content) AS bytes FROM file_revisions WHERE path = ? ORDER BY rev DESC")
        .all(absPath) as { rev: number; path: string; bytes: number; created_at: number }[]
    ).map((r) => ({ rev: r.rev, path: r.path, bytes: r.bytes, createdAt: r.created_at }));
  }

  getRevision(absPath: string, rev: number): string | null {
    const row = this.db.prepare("SELECT content FROM file_revisions WHERE path = ? AND rev = ?").get(absPath, rev) as
      | { content: string }
      | undefined;
    return row?.content ?? null;
  }

  close(): void {
    this.db.close();
  }
}
