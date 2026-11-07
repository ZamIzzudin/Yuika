// P2-WKS — registry workshop persist (Batch 13).
// SQLite SENDIRI (file db runtime yang sama, koneksi sendiri — WAL aman):
// workshop = artefak HOST-LOCAL (container docker di host ini), maka TIDAK
// lewat ISessionStore — mode session Postgres (YUI_DB_DRIVER=postgres) tetap
// menyimpan workshop lokal (sesi boleh direplikasi, container tidak).
import Database from "better-sqlite3";
import type { WorkshopInfo, WorkshopState } from "@yuika/contracts";

interface WorkshopRow {
  project_id: string;
  container_name: string;
  volume_name: string;
  state: string;
  backend: string;
  egress_allow: string;
  memory: string;
  cpus: string;
  pids_limit: number;
  created_at: number;
  last_wake_at: number | null;
  last_sleep_at: number | null;
  uptime_ms: number;
  woken_at: number | null;
}

export class WorkshopStore {
  private db: Database.Database;
  /** woken_at internal (metering uptime saat sleep) — tidak diekspos kontrak. */
  private wokenAt = new Map<string, number>();

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workshops (
        project_id TEXT PRIMARY KEY,
        container_name TEXT NOT NULL,
        volume_name TEXT NOT NULL,
        state TEXT NOT NULL,
        backend TEXT NOT NULL,
        egress_allow TEXT NOT NULL DEFAULT '[]',
        memory TEXT NOT NULL,
        cpus TEXT NOT NULL,
        pids_limit INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        last_wake_at INTEGER,
        last_sleep_at INTEGER,
        uptime_ms INTEGER NOT NULL DEFAULT 0,
        woken_at INTEGER
      );
    `);
    for (const r of this.db.prepare(`SELECT project_id, woken_at FROM workshops WHERE woken_at IS NOT NULL`).all() as { project_id: string; woken_at: number }[]) {
      this.wokenAt.set(r.project_id, r.woken_at);
    }
  }

  private fromRow(r: WorkshopRow): WorkshopInfo {
    return {
      projectId: r.project_id,
      state: r.state as WorkshopState,
      containerName: r.container_name,
      volumeName: r.volume_name,
      backend: r.backend as "docker" | "local",
      egressAllow: JSON.parse(r.egress_allow) as string[],
      resourceCap: { memory: r.memory, cpus: r.cpus, pidsLimit: r.pids_limit },
      createdAt: r.created_at,
      lastWakeAt: r.last_wake_at,
      lastSleepAt: r.last_sleep_at,
      uptimeMs: r.uptime_ms,
    };
  }

  get(projectId: string): WorkshopInfo | null {
    const r = this.db.prepare(`SELECT * FROM workshops WHERE project_id = ?`).get(projectId) as WorkshopRow | undefined;
    return r ? this.fromRow(r) : null;
  }

  list(): WorkshopInfo[] {
    return (this.db.prepare(`SELECT * FROM workshops`).all() as WorkshopRow[]).map((r) => this.fromRow(r));
  }

  /** wokenAt (ms) — dipakai manager utk akumulasi uptime; null = tidak running. */
  wokenAtOf(projectId: string): number | null {
    return this.wokenAt.get(projectId) ?? null;
  }

  upsert(info: WorkshopInfo, wokenAt: number | null): void {
    if (wokenAt) this.wokenAt.set(info.projectId, wokenAt);
    else this.wokenAt.delete(info.projectId);
    this.db
      .prepare(
        `INSERT INTO workshops (project_id, container_name, volume_name, state, backend, egress_allow, memory, cpus, pids_limit, created_at, last_wake_at, last_sleep_at, uptime_ms, woken_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(project_id) DO UPDATE SET
           state=excluded.state, backend=excluded.backend, egress_allow=excluded.egress_allow,
           last_wake_at=excluded.last_wake_at, last_sleep_at=excluded.last_sleep_at,
           uptime_ms=excluded.uptime_ms, woken_at=excluded.woken_at`,
      )
      .run(
        info.projectId, info.containerName, info.volumeName, info.state, info.backend,
        JSON.stringify(info.egressAllow), info.resourceCap.memory, info.resourceCap.cpus,
        info.resourceCap.pidsLimit, info.createdAt, info.lastWakeAt, info.lastSleepAt,
        info.uptimeMs, wokenAt,
      );
  }

  delete(projectId: string): void {
    this.wokenAt.delete(projectId);
    this.db.prepare(`DELETE FROM workshops WHERE project_id = ?`).run(projectId);
  }

  close(): void {
    this.db.close();
  }
}
