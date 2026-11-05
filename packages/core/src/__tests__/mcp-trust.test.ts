// P1-MCP-3 (TASKS.md): trust gate per-workspace (fail-closed) + izin granular
// per tool + audit log panggilan. P1-PRJ-5: binding project×persona (D17).
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { McpTrustEntry } from "@yuika/contracts";
import { isToolAllowed, loadTrust, saveTrust, trustOf, upsertTrust } from "../mcp/trust.js";
import { McpAuditStore } from "../mcp/audit.js";
import { applyMcpBinding } from "../loop.js";

function tmpWs(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "yui-mcp-"));
}

describe("MCP trust gate (fail-closed)", () => {
  it("workspace tanpa file trust → semua server untrusted, semua tool ditolak", () => {
    const ws = tmpWs();
    const trust = loadTrust(ws);
    expect(trust.servers).toEqual([]);
    expect(isToolAllowed(trustOf(trust, "filesystem"), "read_file")).toBe(false);
    expect(isToolAllowed(undefined, "read_file")).toBe(false); // undeclared = tolak
  });

  it("file rusak → konfigurasi kosong (tetap fail-closed, bukan crash)", () => {
    const ws = tmpWs();
    fs.writeFileSync(path.join(ws, "mcp-trust.json"), "{bukan json", "utf-8");
    expect(loadTrust(ws).servers).toEqual([]);
  });

  it("upsert: replace entri lama, pertahankan server lain; deny memblokir tool itu saja", () => {
    const ws = tmpWs();
    saveTrust(ws, { servers: [{ server: "a", trusted: true, denyTools: [] }] });
    upsertTrust(ws, McpTrustEntry.parse({ server: "b", trusted: true, denyTools: ["write_file"] }));
    const trust = loadTrust(ws);
    expect(trust.servers.map((s) => s.server).sort()).toEqual(["a", "b"]);
    const b = trustOf(trust, "b")!;
    expect(isToolAllowed(b, "read_file")).toBe(true);
    expect(isToolAllowed(b, "write_file")).toBe(false); // izin granular per tool
  });

  it("untrust kembali menutup seluruh server", () => {
    const ws = tmpWs();
    upsertTrust(ws, McpTrustEntry.parse({ server: "a", trusted: false, denyTools: [] }));
    expect(isToolAllowed(trustOf(loadTrust(ws), "a"), "read_file")).toBe(false);
  });
});

describe("MCP audit store", () => {
  it("log → recent (terbaru dulu) roundtrip", () => {
    const store = new McpAuditStore(path.join(tmpWs(), "audit.db"));
    store.log({ server: "filesystem", tool: "list_directory", sessionId: "s_1", ok: true, durationMs: 12 });
    store.log({ server: "filesystem", tool: "write_file", sessionId: "s_1", ok: false, error: "deny", durationMs: 0 });
    const [last, first] = store.recent(2);
    expect(last).toMatchObject({ tool: "write_file", ok: false, error: "deny" });
    expect(first).toMatchObject({ tool: "list_directory", ok: true });
    store.close();
  });
});

describe("P1-PRJ-5 — binding MCP project×persona (applyMcpBinding)", () => {
  const schemas = [
    { name: "read_file" },
    { name: "mcp__filesystem__list_directory" },
    { name: "mcp__filesystem__write_file" },
    { name: "mcp__git__status" },
  ];

  it("null (tanpa binding / sesi global) → SEMUA tool MCP disembunyikan", () => {
    expect(applyMcpBinding(schemas, null).map((s) => s.name)).toEqual(["read_file"]);
  });

  it("binding server penuh → prefix `mcp__<srv>__*` lolos, server lain tetap tersembunyi", () => {
    expect(applyMcpBinding(schemas, ["mcp__filesystem__*"]).map((s) => s.name)).toEqual([
      "read_file",
      "mcp__filesystem__list_directory",
      "mcp__filesystem__write_file",
    ]);
  });

  it("binding tool spesifik → hanya nama persis itu", () => {
    expect(applyMcpBinding(schemas, ["mcp__filesystem__list_directory"]).map((s) => s.name)).toEqual([
      "read_file",
      "mcp__filesystem__list_directory",
    ]);
  });
});
