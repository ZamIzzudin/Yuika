// @yuika/core, vault store (Batch 12 / P2-VLT-1, D27; pola rokazo bot-secrets
// + scrub): SQLite terpisah `vault.db` (isolasi dari demo.db), tiap record
// dienkripsi AES-256-GCM dengan master key (env YUI_VAULT_KEY → file
// <data>/vault.key 0600). AAD = metadata record, rename/tamper kolom membuat
// record gagal dibuka (bukan diam-diam terbaca).
//
// THREAT MODEL (jujur, lihat PLAN-WORKSHOP-LIVESCREEN-VAULT §3): key + ciphertext
// di disk yang sama ≠ proteksi dari attacker yang sudah baca filesystem. Nilai
// sesungguhnya: nilai TIDAK PERNAH lewat jalur model/API/event, jalur bocor
// klasik (context, trace, log, SSE) tertutup by-construction.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { VaultKind, VaultScope, VaultSecretMeta } from "@yuika/contracts";

export interface VaultPutInput {
  name: string;
  kind: VaultKind;
  scope: VaultScope;
  projectId?: string | null;
  personaId?: string | null;
  /** Turn id, non-null = run-only (dihapus saat run lain mulai / dispose). */
  runId?: string | null;
  value: string;
}

export interface VaultRecord {
  id: string;
  name: string;
  kind: VaultKind;
  scope: VaultScope;
  projectId: string | null;
  personaId: string | null;
  runId: string | null;
  cipher: string; // b64(iv ‖ ct ‖ tag)
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
}

/** Master key: env (hex 64 / base64 32B) → file vault.key (auto-gen 0600). */
export function loadVaultMasterKey(dataDir: string): { key: Buffer; created: boolean } {
  const env = process.env.YUI_VAULT_KEY;
  if (env) {
    const hex = /^[0-9a-fA-F]{64}$/.test(env) ? Buffer.from(env, "hex") : null;
    const b64 = hex ?? Buffer.from(env, "base64");
    if (b64.length !== 32) throw new Error("YUI_VAULT_KEY must be 32 bytes (64 hex chars or base64)");
    return { key: b64, created: false };
  }
  const file = path.join(dataDir, "vault.key");
  if (fs.existsSync(file)) {
    const k = Buffer.from(fs.readFileSync(file, "utf8").trim(), "hex");
    if (k.length !== 32) throw new Error(`vault.key corrupt (expect 32 bytes hex): ${file}`);
    return { key: k, created: false };
  }
  const key = crypto.randomBytes(32);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, key.toString("hex") + "\n", { mode: 0o600 });
  return { key, created: true };
}

function aadOf(r: Pick<VaultRecord, "id" | "name" | "kind" | "scope" | "projectId" | "personaId">): Buffer {
  return Buffer.from(`${r.id}|${r.name}|${r.kind}|${r.scope}|${r.projectId ?? ""}|${r.personaId ?? ""}`, "utf8");
}

function seal(key: Buffer, plaintext: string, r: Parameters<typeof aadOf>[0]): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(aadOf(r));
  const ct = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]).toString("base64");
}

function open(key: Buffer, r: VaultRecord): string {
  const raw = Buffer.from(r.cipher, "base64");
  if (raw.length < 12 + 16) throw new Error("vault record corrupt");
  const d = crypto.createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  d.setAAD(aadOf(r));
  d.setAuthTag(raw.subarray(raw.length - 16));
  return Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]).toString("utf8");
}

export class VaultStore {
  private db: Database.Database;
  private key: Buffer;

  constructor(dbPath: string, key: Buffer) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.key = key;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vault_secrets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL,
        scope TEXT NOT NULL,
        project_id TEXT,
        persona_id TEXT,
        run_id TEXT,
        cipher TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_used_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_vault_run ON vault_secrets(run_id);
    `);
  }

  /** Upsert by name (nama unik global v0, ambigu scope dicegah untuk agent). */
  put(input: VaultPutInput): VaultRecord {
    const now = Date.now();
    const prev = this.db.prepare("SELECT * FROM vault_secrets WHERE name = ?").get(input.name) as Record<string, unknown> | undefined;
    const rec: VaultRecord = {
      id: prev ? String(prev.id) : `vlt_${crypto.randomUUID()}`,
      name: input.name,
      kind: input.kind,
      scope: input.scope,
      projectId: input.projectId ?? null,
      personaId: input.personaId ?? null,
      runId: input.runId ?? null,
      cipher: "", // diisi seal() di bawah (butuh id final utk AAD)
      createdAt: prev ? Number(prev.created_at) : now,
      updatedAt: now,
      lastUsedAt: prev ? (prev.last_used_at == null ? null : Number(prev.last_used_at)) : null,
    };
    rec.cipher = seal(this.key, input.value, rec);
    this.db
      .prepare(
        `INSERT INTO vault_secrets (id,name,kind,scope,project_id,persona_id,run_id,cipher,created_at,updated_at,last_used_at)
         VALUES (@id,@name,@kind,@scope,@projectId,@personaId,@runId,@cipher,@createdAt,@updatedAt,@lastUsedAt)
         ON CONFLICT(name) DO UPDATE SET kind=@kind, scope=@scope, project_id=@projectId, persona_id=@personaId,
           run_id=@runId, cipher=@cipher, updated_at=@updatedAt, last_used_at=@lastUsedAt`,
      )
      .run(rec as unknown as Record<string, unknown>);
    return rec;
  }

  get(name: string): VaultRecord | undefined {
    const row = this.db.prepare("SELECT * FROM vault_secrets WHERE name = ?").get(name) as Record<string, unknown> | undefined;
    return row ? this.hydrate(row) : undefined;
  }

  /** Dekripsi, dipanggil HANYA oleh manager jalur pakai (secret_http /
   *  run_command env); hasil tak pernah dikembalikan ke model. */
  decrypt(rec: VaultRecord): string {
    return open(this.key, rec);
  }

  list(): VaultSecretMeta[] {
    const rows = this.db.prepare("SELECT * FROM vault_secrets ORDER BY name").all() as Record<string, unknown>[];
    return rows.map((r) => {
      const rec = this.hydrate(r);
      return {
        id: rec.id,
        name: rec.name,
        kind: rec.kind,
        scope: rec.scope,
        projectId: rec.projectId,
        personaId: rec.personaId,
        runOnly: rec.runId != null,
        createdAt: rec.createdAt,
        updatedAt: rec.updatedAt,
        lastUsedAt: rec.lastUsedAt,
      };
    });
  }

  touch(id: string): void {
    this.db.prepare("UPDATE vault_secrets SET last_used_at = ? WHERE id = ?").run(Date.now(), id);
  }

  forget(name: string): boolean {
    const r = this.db.prepare("DELETE FROM vault_secrets WHERE name = ?").run(name);
    return r.changes > 0;
  }

  /** Hapus secret run-only, dipanggil saat turn baru mulai & dispose:
   *  sisa run lain (turn sudah selesai/crash) dibersihkan. */
  purgeRunOnly(exceptRunId?: string): number {
    const r = exceptRunId
      ? this.db.prepare("DELETE FROM vault_secrets WHERE run_id IS NOT NULL AND run_id != ?").run(exceptRunId)
      : this.db.prepare("DELETE FROM vault_secrets WHERE run_id IS NOT NULL").run();
    return r.changes;
  }

  private hydrate(r: Record<string, unknown>): VaultRecord {
    return {
      id: String(r.id),
      name: String(r.name),
      kind: String(r.kind) as VaultKind,
      scope: String(r.scope) as VaultScope,
      projectId: r.project_id == null ? null : String(r.project_id),
      personaId: r.persona_id == null ? null : String(r.persona_id),
      runId: r.run_id == null ? null : String(r.run_id),
      cipher: String(r.cipher),
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
      lastUsedAt: r.last_used_at == null ? null : Number(r.last_used_at),
    };
  }

  close(): void {
    this.db.close();
  }
}
