// @yuika/core, vault manager ( / ): jembatan tool ↔ store ↔
// kartu protected. Dua jalur nilai, keduanya backend-only:
//   1. vault_request → kartu fill (event vault.requested, nilai dikirim user
//      via POST /api/vault/fill/:id, TIDAK pernah masuk event/trace/model).
//   2. resolveForUse → dekripsi + registerActiveSecret (redaksi output).
// Pending fill = pola approval engine (registry globalThis tahan HMR, QUIRK
// bundling per-route Next dev) + deadline auto-skip (turn tak menggantung).
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Emit } from "../session/emit.js";
import type { VaultKind, VaultScope, VaultSecretMeta } from "@yuika/contracts";
import { VaultStore, loadVaultMasterKey, type VaultRecord } from "./store.js";
import { registerActiveSecret, releaseActiveSecret } from "./redact.js";

export interface VaultFillOutcome {
  status: "filled" | "skipped" | "expired";
  /** Metadata SAJA, id record (untuk run-only purge), tanpa nilai. */
  name: string;
  saved: boolean;
}

interface PendingFill {
  requestId: string;
  name: string;
  kind: VaultKind;
  scope: VaultScope;
  projectId: string | null;
  personaId: string | null;
  runId: string | null;
  emit: Emit; // resolve dari REST tetap bisa emit event ke sesi peminta
  resolve: (o: VaultFillOutcome) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

/** Deadline fill (auto-skip, mirip YUI_APPROVAL_TIMEOUT_MS; 0 = nonaktif utk test). */
export function VAULT_FILL_TIMEOUT_MS(): number {
  const v = Number(process.env.YUI_VAULT_FILL_TIMEOUT_MS ?? 300_000);
  return Number.isFinite(v) && v >= 0 ? v : 300_000;
}

export class VaultManager {
  private pending = new Map<string, PendingFill>();

  constructor(public store: VaultStore) {}

  /** Metadata list, tanpa nilai (REST /api/vault & tool vault_list). */
  list(): VaultSecretMeta[] {
    return this.store.list();
  }

  forget(name: string): boolean {
    return this.store.forget(name);
  }

  purgeRunOnly(exceptRunId?: string): number {
    return this.store.purgeRunOnly(exceptRunId);
  }

  /** Terlihat oleh persona/project ini? (workspace = semua; v0 tanpa grant). */
  visible(rec: VaultRecord, viewer: { personaId?: string; projectId?: string | null }): boolean {
    if (rec.scope === "workspace") return true;
    if (rec.scope === "persona") return rec.personaId != null && rec.personaId === viewer.personaId;
    if (rec.scope === "project") return rec.projectId != null && rec.projectId === viewer.projectId;
    return false;
  }

  /** Minta nilai ke user: emit vault.requested → tunggu fill/skip/deadline. */
  requestFill(opts: {
    name: string;
    kind: VaultKind;
    reason: string;
    originHint?: string;
    scope?: VaultScope;
    projectId?: string | null;
    personaId?: string | null;
    runId?: string | null;
    emit: Emit;
  }): Promise<VaultFillOutcome> {
    // sisa run-only dari turn sebelumnya dibersihkan duluan
    this.store.purgeRunOnly(opts.runId ?? undefined);
    const requestId = `vlt_${randomUUID()}`;
    const meta = { requestId, name: opts.name, kind: opts.kind, reason: opts.reason, ...(opts.originHint ? { originHint: opts.originHint } : {}) };
    opts.emit({ type: "vault.requested", ...meta });
    return new Promise<VaultFillOutcome>((resolve) => {
      const timeoutMs = VAULT_FILL_TIMEOUT_MS();
      const timer = timeoutMs > 0 ? setTimeout(() => this.expire(requestId, opts.emit), timeoutMs) : null;
      timer?.unref?.();
      this.pending.set(requestId, {
        requestId,
        name: opts.name,
        kind: opts.kind,
        scope: opts.scope ?? "workspace",
        projectId: opts.projectId ?? null,
        personaId: opts.personaId ?? null,
        runId: opts.runId ?? null,
        emit: opts.emit,
        resolve,
        timer,
      });
    });
  }

  /** Dipanggil REST fill, SATU-SATUNYA pintu nilai masuk. Tidak pernah log. */
  resolveFill(requestId: string, value: string, save: boolean): boolean {
    const p = this.pending.get(requestId);
    if (!p) return false;
    this.pending.delete(requestId);
    if (p.timer) clearTimeout(p.timer);
    this.store.put({
      name: p.name,
      kind: p.kind,
      scope: p.scope,
      projectId: p.projectId,
      personaId: p.personaId,
      runId: save ? null : p.runId, // save=false → run-only
      value,
    });
    p.emit({ type: "vault.resolved", requestId, name: p.name, status: "filled", hasValue: true, saved: save });
    p.resolve({ status: "filled", name: p.name, saved: save });
    return true;
  }

  /** User menekan Skip, agent menerima sinyal jelas utk fallback. */
  skipFill(requestId: string): boolean {
    const p = this.pending.get(requestId);
    if (!p) return false;
    this.pending.delete(requestId);
    if (p.timer) clearTimeout(p.timer);
    p.emit({ type: "vault.resolved", requestId, name: p.name, status: "skipped", hasValue: false, saved: false });
    p.resolve({ status: "skipped", name: p.name, saved: false });
    return true;
  }

  private expire(requestId: string, emit: Emit): void {
    const p = this.pending.get(requestId);
    if (!p) return;
    this.pending.delete(requestId);
    emit({ type: "vault.resolved", requestId, name: p.name, status: "expired", hasValue: false, saved: false });
    p.resolve({ status: "expired", name: p.name, saved: false });
  }

  hasPending(): boolean {
    return this.pending.size > 0;
  }

  /** Buka nilai utk DIPAKAI backend (secret_http header / env export).
   *  Return { value, release }, caller WAJIB release() setelah selesai
   *  (nilai keluar dari registry redaksi saat tidak ada pemakai lagi). */
  resolveForUse(
    name: string,
    viewer: { personaId?: string; projectId?: string | null },
  ): { value: string; record: VaultRecord; release: () => void } | null {
    const rec = this.store.get(name);
    if (!rec || !this.visible(rec, viewer)) return null;
    const value = this.store.decrypt(rec);
    this.store.touch(rec.id);
    registerActiveSecret(value);
    let released = false;
    return {
      value,
      record: rec,
      release: () => {
        if (!released) {
          released = true;
          releaseActiveSecret(value);
        }
      },
    };
  }

  close(): void {
    this.store.close();
  }
}

// ── singleton (tahan HMR Next dev) ───────────────────────────────────────────
const g = globalThis as unknown as { __yuiVault?: VaultManager };

/** Ambil/buat vault singleton. dataDir = direktori demo.db (vault.db + vault.key). */
export function getVault(dataDir?: string): VaultManager {
  if (g.__yuiVault) return g.__yuiVault;
  const dir = dataDir ?? path.join(process.cwd(), ".data");
  const { key, created } = loadVaultMasterKey(dir);
  if (created) {
    // jujur soal backup: kehilangan vault.key = kehilangan semua rahasia
    console.warn(`[yui:vault] master key baru dibuat di ${path.join(dir, "vault.key")}, tambahkan ke backup; HILANG = semua rahasia vault tak bisa dibuka.`);
  }
  g.__yuiVault = new VaultManager(new VaultStore(path.join(dir, "vault.db"), key));
  return g.__yuiVault;
}

/** Test helper, ganti singleton (map lama ditutup). */
export function setVaultForTests(m: VaultManager | null): void {
  g.__yuiVault?.close();
  g.__yuiVault = m ?? undefined;
}
