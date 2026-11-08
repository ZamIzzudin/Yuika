// @yuika/core, P0-DATA-1: sync-bridge SessionStore → worker PostgreSQL.
// Main thread memanggil metode SINKRON (identik API better-sqlite3), panggilan
// dikirim ke worker (pg-worker.ts), lalu main memblokir via Atomics.wait sampai
// hasil ditulis worker ke SharedArrayBuffer. Blokir event loop per query ==
// perilaku better-sqlite3 (DB lokal; PG disarankan co-located dengan api).
//
// File ini hanya mengimpor node:worker_threads, TIDAK memuat `postgres`
// (paket itu hidup di worker; bundle web & proses utama tetap bersih).
import { Worker } from "node:worker_threads";
import type { ISessionStore } from "./store.js";

const METHODS = [
  "createSession", "getSession", "listProjectSessions", "personaSessionCounts", "personaDoneTurnCounts",
  "appendMessage", "searchMessages", "getMessages", "getMessagesWithSeq",
  "saveContextCheckpoint", "latestContextCheckpoint",
  "startDelegationJob", "finishDelegationJob", "findRunningDelegationJobs", "listDelegationJobs",
  "archiveOldEvents", "appendEvent", "getEvents", "findInterruptedTurns",
  "insertApproval", "settleApproval", "listPendingApprovals", "rememberApproval", "getRememberedTools",
  "expirePendingApprovals", "deleteProjectSessions",
] as const;

const WAIT_TIMEOUT_MS = 30_000; // guard: PG jauh/lambat → error jelas, bukan hang

class PgSyncStore {
  private worker: Worker;
  private seq = 0;

  constructor() {
    const url = process.env.YUI_PG_URL ?? process.env.DATABASE_URL ?? "";
    if (!url) throw new Error("[yui] YUI_DB_DRIVER=postgres tapi DATABASE_URL kosong (lihat .env.example)");
    this.worker = new Worker(new URL("./pg-worker.ts", import.meta.url), {
      // warisi execArgv (tsx loader dll.), penting agar .TS worker termuat
      execArgv: process.execArgv,
      env: { ...process.env, YUI_PG_URL: url },
    });
    this.worker.unref?.();
  }

  call(method: string, args: unknown[]): unknown {
    const header = new Int32Array(new SharedArrayBuffer(8));
    // @ts-expect-error argumen kedua (growable SAB) belum ada di lib TS repo
    const body = new SharedArrayBuffer(1 << 20, { maxByteLength: 1 << 27 }); // 1MB → maks 128MB
    const id = ++this.seq;
    this.worker.postMessage({ method, args, header, body });
    for (;;) {
      const r = Atomics.wait(header, 0, 0, WAIT_TIMEOUT_MS);
      if (r === "timed-out") throw new Error(`[pg-bridge] ${method} timeout ${WAIT_TIMEOUT_MS}ms, cek konektivitas Postgres`);
      const status = Atomics.load(header, 0);
      if (status === 1 || status === 3) {
        const len = Atomics.load(header, 1);
        const text = new TextDecoder().decode(new Uint8Array(body, 0, len));
        const parsed = JSON.parse(text) as { ok?: unknown; err?: string };
        if (status === 3) throw new Error(`[pg-bridge] ${method}: ${parsed.err ?? "unknown"}`);
        return parsed.ok ?? null;
      }
      // status masih 0 (spurious wake), tunggu lagi
    }
  }

  close(): void {
    void this.worker.terminate();
  }
}

/** Factory sinkron driver Postgres, dipanggil createSessionStore() saat
 *  YUI_DB_DRIVER=postgres. Metode dibangkitkan dari daftar METHODS (satu sumber
 *  kebenaran bersama kontrak ISessionStore, selisih terdeteksi typecheck). */
export function createPgStore(): ISessionStore {
  const s = new PgSyncStore();
  const out: Record<string, unknown> = {};
  for (const m of METHODS) out[m] = (...args: unknown[]) => s.call(m, args);
  out.close = () => s.close();
  return out as unknown as ISessionStore;
}
