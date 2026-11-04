// P1-MEM-1: tool memory_append — agent menyimpan catatan reusable; scope user
// lintas project, scope project hanya untuk sesi yang melekat ke project.
import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registry, resetRegistryForTests } from "../registry.js";
import { registerMemoryTools } from "../tools/memory-tools.js";
import { readMemory } from "../memory/manager.js";
import { SessionStore } from "../session/store.js";
import { ProjectStore } from "../project/store.js";

const ctx = { sessionId: "s_prj", turnId: "t1", workspacePath: "/tmp", emit: () => {}, requestApproval: async () => true };

describe("memory_append tool (P1-MEM-1)", () => {
  let projects: ProjectStore;
  let sessions: SessionStore;
  let ws: string;

  beforeEach(() => {
    resetRegistryForTests();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-memtool-"));
    ws = path.join(dir, "ws");
    projects = new ProjectStore(path.join(dir, "p.db"));
    sessions = new SessionStore(path.join(dir, "s.db"));
    projects.createProject({ id: "p_a", name: "A", rootPath: "projects/p_a" });
    sessions.createSession("s_prj", "yui-conductor", "SYS", [], "p_a");
    sessions.createSession("s_free", "yui-scholar", "SYS", []);
    registerMemoryTools({ sessionStore: sessions, projects, workspacePath: ws });
  });

  it("scope user → tertulis di workspace/USER.md (dibaca sesi mana pun)", async () => {
    const res = await registry.dispatch("memory_append", { scope: "user", note: "jawaban ringkas, bahasa Indonesia" }, ctx);
    expect(res.isError).toBeFalsy();
    const content = readMemory(ws, "user");
    expect(content).toContain("Maestro Yui: jawaban ringkas, bahasa Indonesia");
  });

  it("dedupe: catatan inti sama → skip, bukan duplikat", async () => {
    await registry.dispatch("memory_append", { scope: "user", note: "pakai dark theme" }, ctx);
    const res = await registry.dispatch("memory_append", { scope: "user", note: "Pakai dark theme" }, { ...ctx, sessionId: "s_free" });
    expect(String(res.result)).toContain("di-skip");
    expect(readMemory(ws, "user").match(/dark theme/g)).toHaveLength(1);
  });

  it("scope project di sesi project → MEMORY.md project; di sesi bebas → error jelas", async () => {
    const res = await registry.dispatch("memory_append", { scope: "project", note: "stack: Next.js + SQLite" }, ctx);
    expect(res.isError).toBeFalsy();
    const mem = readMemory(ws, "project", path.join(ws, "projects/p_a"), "A");
    expect(mem).toContain("stack: Next.js + SQLite");

    const bad = await registry.dispatch("memory_append", { scope: "project", note: "x".repeat(10) }, { ...ctx, sessionId: "s_free" });
    expect(bad.isError).toBe(true);
  });

  it("catatan < 3 char ditolak validasi zod (registry error)", async () => {
    const res = await registry.dispatch("memory_append", { scope: "user", note: "ab" }, ctx);
    expect(res.isError).toBe(true);
  });
});
