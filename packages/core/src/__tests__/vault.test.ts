// Batch 12 (P2-VLT) — Vault v0: store AES-256-GCM (AAD tamper, key file,
// purge run-only), redaksi nilai aktif (plain/base64/urlencode), kartu fill
// via manager (deadline skip, nilai TIDAK pernah di event), tools
// vault_request/vault_list/vault_forget/secret_http (origin-bound, redirect
// ditolak, response di-redact), run_command env refs + nama reserved.
// Semua hermetic — TANPA network eksternal.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { VaultStore, loadVaultMasterKey } from "../vault/store.js";
import { VaultManager, setVaultForTests } from "../vault/manager.js";
import {
  redactActive, registerActiveSecret, releaseActiveSecret,
  activeSecretCount, resetActiveSecretsForTests, VAULT_REDACTED,
} from "../vault/redact.js";
import { registerVaultTools } from "../tools/vault-tools.js";
import { registry, resetRegistryForTests, type ToolContext } from "../registry.js";
import type { EventDraft } from "@yuika/contracts";

// token tanpa pola vendor (sk-/ghp-) supaya jalur redact AKTIF yang diuji,
// bukan tertangkap duluan redactSecrets bentuk-baku
const TOKEN = "zzvlt-token-99887766XYZW";
const B64TOKEN = Buffer.from(TOKEN).toString("base64");

let dir: string;
let V: VaultManager; // SATU vault per test (registerVaultTools memegang ini)
const servers: http.Server[] = [];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-vault-"));
  resetActiveSecretsForTests();
  resetRegistryForTests();
  V = new VaultManager(new VaultStore(path.join(dir, "vault.db"), loadVaultMasterKey(dir).key));
  setVaultForTests(V);
  registerVaultTools({ vault: V });
});

afterEach(() => {
  vi.unstubAllEnvs();
  setVaultForTests(null); // tutup db test
  return Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

function ctx(emitLog?: EventDraft[], personaId = "yui-scholar"): ToolContext {
  const log = emitLog ?? [];
  return {
    sessionId: "s_test",
    turnId: "t_test",
    workspacePath: dir,
    personaId,
    projectId: null,
    emit: (d) => log.push(d),
    requestApproval: async () => true,
  };
}

function serve(handler: http.RequestListener): Promise<string> {
  return new Promise((resolve) => {
    const s = http.createServer(handler);
    servers.push(s);
    s.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(s.address() as AddressInfo).port}`));
  });
}

// ── P2-VLT-1: store ──────────────────────────────────────────────────────────

describe("VLT-1 store", () => {
  it("roundtrip encrypt/decrypt + metadata list TANPA nilai", () => {
    const s = new VaultStore(path.join(dir, "a.db"), loadVaultMasterKey(dir).key);
    s.put({ name: "alpha", kind: "api_key", scope: "workspace", value: TOKEN });
    const rec = s.get("alpha")!;
    expect(s.decrypt(rec)).toBe(TOKEN);
    expect(rec.cipher).not.toContain(TOKEN);
    expect(JSON.stringify(s.list())).not.toContain(TOKEN);
    expect(s.list()[0]!.name).toBe("alpha");
    expect(s.list()[0]!.runOnly).toBe(false);
    s.close();
  });

  it("AAD tamper: rename record → decrypt GAGAL (bukan diam-diam terbaca)", () => {
    const s = new VaultStore(path.join(dir, "b.db"), loadVaultMasterKey(dir).key);
    s.put({ name: "beta", kind: "api_key", scope: "workspace", value: TOKEN });
    const raw = (s as unknown as { db: import("better-sqlite3").Database }).db;
    raw.prepare("UPDATE vault_secrets SET name='gamma' WHERE name='beta'").run();
    const rec = s.get("gamma")!;
    expect(() => s.decrypt(rec)).toThrow();
    s.close();
  });

  it("master key: env hex64; file vault.key auto-gen lalu reuse; env salah panjang → error", () => {
    const d2 = fs.mkdtempSync(path.join(os.tmpdir(), "yui-key-"));
    vi.stubEnv("YUI_VAULT_KEY", "ab".repeat(32));
    expect(loadVaultMasterKey(d2).key.length).toBe(32);
    delete process.env.YUI_VAULT_KEY;
    const first = loadVaultMasterKey(d2);
    expect(first.created).toBe(true);
    expect(fs.existsSync(path.join(d2, "vault.key"))).toBe(true);
    expect(loadVaultMasterKey(d2).key.equals(first.key)).toBe(true);
    vi.stubEnv("YUI_VAULT_KEY", "too-short");
    expect(() => loadVaultMasterKey(d2)).toThrow(/32 bytes/);
  });

  it("run-only: purgeRunOnly kecuali turn aktif; saved tak tersentuh", () => {
    V.store.put({ name: "keep", kind: "api_key", scope: "workspace", runId: "t_now", value: "x" });
    V.store.put({ name: "old", kind: "api_key", scope: "workspace", runId: "t_lama", value: "y" });
    V.store.put({ name: "saved", kind: "api_key", scope: "workspace", value: "z" });
    expect(V.store.purgeRunOnly("t_now")).toBe(1);
    expect(V.store.get("keep")).toBeDefined();
    expect(V.store.get("old")).toBeUndefined();
    expect(V.store.get("saved")).toBeDefined();
  });
});

// ── P2-VLT-5: redaksi nilai aktif ────────────────────────────────────────────

describe("VLT-5 redactActive", () => {
  it("plain + base64 + urlencode diganti; nilai pendek dilewati; idempotent; release bersih", () => {
    registerActiveSecret(TOKEN);
    expect(activeSecretCount()).toBe(1);
    const enc = encodeURIComponent(TOKEN);
    const out = redactActive(`token=${TOKEN} b64=${B64TOKEN} url=${enc}`);
    expect(out).not.toContain(TOKEN);
    expect(out).not.toContain(B64TOKEN);
    expect(out).not.toContain(enc);
    expect((out.match(/«redacted\(vault\)»/g) ?? []).length).toBe(3);
    expect(redactActive(out)).toBe(out); // idempotent
    releaseActiveSecret(TOKEN);
    expect(activeSecretCount()).toBe(0);
    expect(redactActive(`token=${TOKEN}`)).toContain(TOKEN); // tidak aktif lagi
    registerActiveSecret("ab"); // <6 char diabaikan
    expect(redactActive("ab ab ab")).toBe("ab ab ab");
  });
});

// ── P2-VLT-2: manager fill flow ──────────────────────────────────────────────

describe("VLT-2 fill flow", () => {
  it("request → resolveFill: tersimpan, event metadata SAJA (nilai tak pernah bocor)", async () => {
    const log: EventDraft[] = [];
    const p = V.requestFill({ name: "svc", kind: "api_key", reason: "call API X", runId: "t1", emit: (d) => log.push(d) });
    await new Promise((r) => setTimeout(r, 10));
    expect(V.hasPending()).toBe(true);
    expect(V.resolveFill("salah-id", "x", true)).toBe(false);
    const ok = V.resolveFill(log.find((e) => e.type === "vault.requested")!.requestId, TOKEN, true);
    expect(ok).toBe(true);
    expect(await p).toEqual({ status: "filled", name: "svc", saved: true });
    expect(JSON.stringify(log)).not.toContain(TOKEN); // P2-VLT-5 acceptance
    expect(V.list().find((m) => m.name === "svc")!.runOnly).toBe(false);
  });

  it("save=false → run-only; skip → sinyal fallback; deadline → expired", async () => {
    vi.stubEnv("YUI_VAULT_FILL_TIMEOUT_MS", "40");
    const log: EventDraft[] = [];
    const emit = (d: EventDraft) => log.push(d);
    const p1 = V.requestFill({ name: "one", kind: "command", reason: "r", runId: "t1", emit });
    await new Promise((r) => setTimeout(r, 5));
    V.resolveFill(log.find((e) => e.type === "vault.requested")!.requestId, "vvvvvv-run", false);
    expect((await p1).saved).toBe(false);
    expect(V.list().find((m) => m.name === "one")!.runOnly).toBe(true);

    const p2 = V.requestFill({ name: "two", kind: "command", reason: "r", runId: "t1", emit });
    await new Promise((r) => setTimeout(r, 5));
    V.skipFill(log.filter((e) => e.type === "vault.requested").at(-1)!.requestId);
    expect((await p2).status).toBe("skipped");

    const p3 = V.requestFill({ name: "three", kind: "command", reason: "r", runId: "t1", emit });
    await new Promise((r) => setTimeout(r, 60));
    expect((await p3).status).toBe("expired");
    expect(JSON.stringify(log)).not.toContain("vvvvvv-run");
  });

  it("scope visibility: persona-scoped tak terlihat persona lain; resolveForUse register+release", () => {
    V.store.put({ name: "priv", kind: "api_key", scope: "persona", personaId: "yui-coder", value: TOKEN });
    expect(V.resolveForUse("priv", { personaId: "yui-scholar" })).toBeNull();
    const s = V.resolveForUse("priv", { personaId: "yui-coder" })!;
    expect(s.value).toBe(TOKEN);
    expect(activeSecretCount()).toBe(1); // terdaftar utk redaksi
    s.release();
    expect(activeSecretCount()).toBe(0);
  });
});

// ── P2-VLT-2/3: tools ────────────────────────────────────────────────────────

describe("VLT tools", () => {
  it("vault_request → fill via manager → hasil metadata only; kedua kalinya tanpa kartu", async () => {
    const log: EventDraft[] = [];
    const c = ctx(log);
    const p = registry.dispatch("vault_request", { name: "openai", kind: "api_key", reason: "query GPT" }, c);
    await new Promise((r) => setTimeout(r, 10));
    const reqId = log.find((e) => e.type === "vault.requested")!.requestId;
    V.resolveFill(reqId, TOKEN, true);
    const res = await p;
    expect(res.isError).toBeFalsy();
    expect(JSON.stringify(res.result)).not.toContain(TOKEN);
    expect(res.result).toMatchObject({ name: "openai", hasValue: true, saved: true });
    const res2 = await registry.dispatch("vault_request", { name: "openai", kind: "api_key", reason: "x" }, ctx(log));
    expect(res2.result).toMatchObject({ hasValue: true, note: expect.stringContaining("already") });
  });

  it("vault_request → skip → isError dengan status utk fallback agent", async () => {
    const log: EventDraft[] = [];
    const p = registry.dispatch("vault_request", { name: "svc2", kind: "api_key", reason: "r" }, ctx(log));
    await new Promise((r) => setTimeout(r, 10));
    V.skipFill(log.find((e) => e.type === "vault.requested")!.requestId);
    const res = await p;
    expect(res.isError).toBe(true);
    expect(res.result).toMatchObject({ error: "not_provided", status: "skipped" });
  });

  it("vault_list: metadata tanpa nilai", async () => {
    V.store.put({ name: "l1", kind: "command", scope: "workspace", value: TOKEN });
    const res = await registry.dispatch("vault_list", {}, ctx());
    expect(JSON.stringify(res.result)).not.toContain(TOKEN);
    expect(res.result).toMatchObject({ secrets: [{ name: "l1", kind: "command" }] });
  });

  it("vault_forget: hapus", async () => {
    V.store.put({ name: "dead", kind: "api_key", scope: "workspace", value: "x" });
    const res = await registry.dispatch("vault_forget", { name: "dead" }, ctx());
    expect(res.result).toMatchObject({ deleted: true });
    expect(V.store.get("dead")).toBeUndefined();
  });

  it("secret_http: header disuntik, response ECHO nilai ter-redact, vault.used tercatat, registry bersih", async () => {
    V.store.put({ name: "api", kind: "api_key", scope: "workspace", value: TOKEN });
    const base = await serve((req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ auth: req.headers["x-api-key"] ?? req.headers.authorization ?? null, ok: true }));
    });
    const log: EventDraft[] = [];
    const res = await registry.dispatch("secret_http", { url: base, auth: { name: "api", via: "x-api-key" } }, ctx(log));
    expect(res.isError).toBeFalsy();
    const body = JSON.stringify(res.result);
    expect(body).not.toContain(TOKEN); // redaksi aktif bekerja pada echo!
    expect(body).not.toContain(B64TOKEN);
    expect(res.result).toMatchObject({ status: 200, ok: true });
    expect(log.some((e) => e.type === "vault.used" && e.name === "api" && e.channel === "http")).toBe(true);
    expect(activeSecretCount()).toBe(0); // released setelah pakai
  });

  it("secret_http: redirect DITOLAK (origin-bound); http non-loopback DITOLAK; ref hilang → not_found", async () => {
    V.store.put({ name: "api", kind: "api_key", scope: "workspace", value: TOKEN });
    const base = await serve((_req, res) => {
      res.writeHead(302, { location: "https://evil.example/x" });
      res.end();
    });
    const r1 = await registry.dispatch("secret_http", { url: base, auth: { name: "api", via: "bearer" } }, ctx());
    expect(r1.isError).toBe(true);
    expect((r1.result as { error: string }).error).toBe("redirect_refused");

    const r2 = await registry.dispatch("secret_http", { url: "http://example.com/x", auth: { name: "api" } }, ctx());
    expect((r2.result as { error: string }).error).toBe("bad_origin");

    const r3 = await registry.dispatch("secret_http", { url: "https://x.example/", auth: { name: "nope" } }, ctx());
    expect((r3.result as { error: string }).error).toBe("not_found");
  });
});

// ── P2-VLT-3: run_command env refs ───────────────────────────────────────────

describe("VLT-3 run_command env", () => {
  it("env vault: ref di-resolve backend-side; stdout token ter-redact; event vault.used; release", async () => {
    vi.stubEnv("YUI_SANDBOX", "off");
    V.store.put({ name: "npm_tok", kind: "command", scope: "workspace", value: TOKEN });
    const script = path.join(dir, "leak.js");
    fs.writeFileSync(script, "console.log(process.env.MY_TOKEN);\n");
    const { registerRunCommandTool } = await import("../tools/run-command.js");
    registerRunCommandTool();
    const log: EventDraft[] = [];
    const res = await registry.dispatch(
      "run_command",
      { command: "node", args: ["leak.js"], env: { MY_TOKEN: "vault:npm_tok" } },
      ctx(log),
    );
    const out = res.result as { stdout: string };
    expect(out.stdout).toContain(VAULT_REDACTED);
    expect(out.stdout).not.toContain(TOKEN);
    expect(log.some((e) => e.type === "vault.used" && e.channel === "command")).toBe(true);
    expect(activeSecretCount()).toBe(0);
  });

  it("validasi: nama reserved + nilai non-vault ditolak; ref tak ada → vault_not_found", async () => {
    vi.stubEnv("YUI_SANDBOX", "off");
    const { registerRunCommandTool } = await import("../tools/run-command.js");
    registerRunCommandTool();
    const r1 = await registry.dispatch("run_command", { command: "echo", args: ["x"], env: { PATH: "vault:x" } }, ctx());
    expect(r1.isError).toBe(true);
    expect(JSON.stringify(r1.result)).toContain("reserved");
    const r2 = await registry.dispatch("run_command", { command: "echo", args: ["x"], env: { MY_T: "plain-secret" } }, ctx());
    expect(r2.isError).toBe(true);
    expect(JSON.stringify(r2.result)).toContain("vault:");
    const r3 = await registry.dispatch("run_command", { command: "node", args: ["nope.js"], env: { MY_T: "vault:absent" } }, ctx());
    expect((r3.result as { error: string }).error).toBe("vault_not_found");
  });
});

// ── VLT-5: acceptance negatif lintas permukaan ───────────────────────────────

describe("VLT-5 negative acceptance", () => {
  it("nilai TIDAK pernah muncul di event, hasil tool, meta list, maupun ciphertext", async () => {
    const log: EventDraft[] = [];
    const p = V.requestFill({ name: "sec", kind: "api_key", reason: "r", runId: "t", emit: (d) => log.push(d) });
    await new Promise((r) => setTimeout(r, 5));
    V.resolveFill(log.find((e) => e.type === "vault.requested")!.requestId, TOKEN, true);
    await p;
    const base = await serve((req, res) => {
      res.end(`echo ${req.headers.authorization}`);
    });
    const r = await registry.dispatch("secret_http", { url: base, auth: { name: "sec", via: "bearer" } }, ctx(log));
    for (const s of [JSON.stringify(log), JSON.stringify(r.result), JSON.stringify(V.list()), V.store.get("sec")!.cipher]) {
      expect(s).not.toContain(TOKEN);
      expect(s).not.toContain(B64TOKEN);
    }
  });
});
