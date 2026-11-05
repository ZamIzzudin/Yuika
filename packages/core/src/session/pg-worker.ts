// @yui/core — P0-DATA-1: WORKER driver PostgreSQL. Dimuat lewat worker_threads
// dari pg-bridge.ts (proses utama TIDAK mengimpor paket `postgres`).
// Protokol: hasil dikirim lewat SharedArrayBuffer (growable) + Atomics —
// main thread memblokir dengan Atomics.wait (paritas semantik better-sqlite3).
import { parentPort } from "node:worker_threads";
import { PgSessionStore } from "./pg-session.js";

const url = process.env.YUI_PG_URL ?? process.env.DATABASE_URL ?? "";
if (!url) throw new Error("[pg-worker] DATABASE_URL kosong");
const store = new PgSessionStore(url);
await store.migrate();

interface Job {
  method: string;
  args: unknown[];
  header: Int32Array; // [status, byteLen] — 0 pending · 1 ok · 3 error
  body: SharedArrayBuffer; // growable — bytes hasil JSON
}

// status: 0=pending 1=ok 3=error
function reply(job: Job, ok: boolean, value: unknown): void {
  const bytes = new TextEncoder().encode(JSON.stringify(ok ? { ok: value } : { err: String(value) }));
  if (bytes.length > job.body.byteLength) {
    // Growable SAB (Node ≥24): worker boleh grow dari thread lain
    // @ts-expect-error lib TS repo belum es2024
    job.body.grow(Math.ceil((bytes.length * 1.5) / 65536) * 65536);
  }
  new Uint8Array(job.body).set(bytes);
  Atomics.store(job.header, 1, bytes.length);
  Atomics.store(job.header, 0, ok ? 1 : 3);
  Atomics.notify(job.header, 0);
}

parentPort!.on("message", (job: Job) => {
  void (async () => {
    try {
      const fn = (store as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[job.method];
      if (typeof fn !== "function") throw new Error(`metode store tak dikenal: ${job.method}`);
      const value = await fn.call(store, ...job.args);
      reply(job, true, value === undefined ? null : value);
    } catch (e) {
      reply(job, false, e instanceof Error ? `${e.message}\n${e.stack?.split("\n")[1] ?? ""}` : String(e));
    }
  })();
});
