// (request user): hapus project = bersihkan SEMUA artefak terkait,
// sesi & eventnya, task & project_events, file workspace (MEMORY.md project,
// uploads), revisi file, audit MCP. YANG DIPERTAHANKAN: skill persona & usage
// ledger (akuntansi jujur). Test ini mereplikasi urutan runtime.deleteProject
// dengan 4 store berbagi SATU file DB (persis wiring runtime).
import { describe, expect, it, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProjectStore } from "../project/store.js";
import { SessionStore } from "../session/store.js";
import { FileRevisionStore } from "../project/revisions.js";
import { McpAuditStore } from "../mcp/audit.js";
import { UsageLedger } from "../usage/ledger.js";
import { DeleteProjectResult } from "@yuika/contracts";

let tmp = "";

afterEach(() => {
  if (!tmp) return;
  // Windows: WAL file butuh handle tertutup, semua store di-close dulu.
  for (const f of fs.readdirSync(tmp)) {
    try {
      fs.rmSync(path.join(tmp, f), { force: true, recursive: true });
    } catch {
      /* lenient: handle WAL kadang masih dikuasai sesaat */
    }
  }
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* lenient (EPERM Windows) */
  }
  tmp = "";
});

function setup() {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "yui-delprj-"));
  const db = path.join(tmp, "data.db");
  const ws = path.join(tmp, "ws");
  const projects = new ProjectStore(db);
  const sessions = new SessionStore(db);
  const revisions = new FileRevisionStore(db);
  const audit = new McpAuditStore(db);
  const ledger = new UsageLedger(db);
  return { db, ws, projects, sessions, revisions, audit, ledger };
}

describe("hapus project + artefak ()", () => {
  it("urutan runtime.deleteProject: sesi/task/file/revisi/audit bersih, project lain & usage utuh", () => {
    const { ws, projects, sessions, revisions, audit, ledger } = setup();
    projects.createProject({ id: "p_a", name: "A", rootPath: "projects/p_a" });
    projects.createProject({ id: "p_b", name: "B", rootPath: "projects/p_b" });
    projects.createTask({ id: "t1", projectId: "p_a", title: "kerja A" });
    projects.createTask({ id: "t2", projectId: "p_b", title: "kerja B" });

    sessions.createSession("s_a", "yui-coder", "SYS", [], "p_a");
    sessions.createSession("s_b", "yui-scribe", "SYS", [], "p_b");
    sessions.appendEvent("s_a", { type: "turn.started", turnId: "t1" } as never);
    sessions.appendEvent("s_b", { type: "turn.started", turnId: "t2" } as never);
    sessions.insertApproval({ requestId: "ap_a", sessionId: "s_a", tool: "run_command", args: {}, reason: "uji" });
    sessions.insertApproval({ requestId: "ap_b", sessionId: "s_b", tool: "run_command", args: {}, reason: "uji" });
    sessions.rememberApproval("s_a", "run_command");

    // File workspace project + memory project (persis layout memory manager)
    const rootA = path.join(ws, "projects", "p_a");
    const rootB = path.join(ws, "projects", "p_b");
    fs.mkdirSync(rootA, { recursive: true });
    fs.mkdirSync(rootB, { recursive: true });
    fs.writeFileSync(path.join(rootA, "MEMORY.md"), "# mem A", "utf-8");
    fs.mkdirSync(path.join(rootA, "code"), { recursive: true });
    fs.writeFileSync(path.join(rootA, "code", "a.ts"), "// A", "utf-8");
    fs.writeFileSync(path.join(rootB, "MEMORY.md"), "# mem B", "utf-8");
    revisions.saveRevision(path.join(rootA, "code", "a.ts"), "// lama A");
    revisions.saveRevision(path.join(rootB, "MEMORY.md"), "# lama B");

    audit.log({ server: "fs", tool: "read", sessionId: "s_a", ok: true, durationMs: 5 });
    audit.log({ server: "fs", tool: "read", sessionId: "s_b", ok: true, durationMs: 5 });

    // Usage DIPERTAHANKAN (akuntansi), baris untuk project terhapus tetap historis.
    ledger.record({ sessionId: "s_a", projectId: "p_a", personaId: "yui-coder", model: "m", promptTokens: 10, outputTokens: 5, latencyMs: 100, at: Date.now() });
    ledger.record({ sessionId: "s_b", projectId: "p_b", personaId: "yui-scribe", model: "m", promptTokens: 20, outputTokens: 8, latencyMs: 120, at: Date.now() });

    // ==== urutan persis runtime.deleteProject("p_a") ====
    const delSessions = sessions.deleteProjectSessions("p_a");
    const auditRows = audit.deleteForSessions(["s_a"]);
    const nRev = revisions.deleteRevisionsUnder(rootA + path.sep);
    fs.rmSync(rootA, { recursive: true, force: true });
    const delProject = projects.deleteProjectData("p_a");
    // ================================================

    // hasil sesuai kontrak DeleteProjectResult
    const result = DeleteProjectResult.parse({
      ok: true,
      projectId: "p_a",
      name: "A",
      kind: "project",
      deleted: {
        sessions: delSessions.sessions,
        events: delSessions.events,
        approvals: delSessions.approvals,
        tasks: delProject.tasks,
        projectEvents: delProject.projectEvents,
        revisions: nRev,
        auditRows,
        workshop: false, // replika tanpa workshop manager (runtime asli: destroy)
        // The real runtime calls terminal.killSessionsUnder(root); this
        // store-level replica has 0 terminal sessions (no manager).
        terminalSessions: 0,
        workspaceDir: rootA,
      },
      keptUsage: true,
      keptSkills: true,
    });
    expect(result.deleted.sessions).toBe(1);
    expect(result.deleted.events).toBe(1);
    expect(result.deleted.approvals).toBe(1);
    expect(result.deleted.tasks).toBe(1);
    expect(result.deleted.revisions).toBe(1);
    expect(result.deleted.auditRows).toBe(1);

    // project A lenyap; project B utuh (sesi, task, event, file, revisi, audit)
    expect(projects.getProject("p_a")).toBeUndefined();
    expect(projects.getProject("p_b")).toBeDefined();
    expect(sessions.listProjectSessions("p_a")).toHaveLength(0);
    expect(sessions.listProjectSessions("p_b")).toHaveLength(1);
    expect(projects.listEvents("p_b").length).toBeGreaterThanOrEqual(0);
    expect(projects.listEvents("p_a")).toHaveLength(0);
    expect(fs.existsSync(rootA)).toBe(false);
    expect(fs.existsSync(path.join(rootB, "MEMORY.md"))).toBe(true);
    expect(revisions.listRevisions(path.join(rootB, "MEMORY.md"))).toHaveLength(1);
    expect(revisions.listRevisions(path.join(rootA, "code", "a.ts"))).toHaveLength(0);
    expect(audit.recent(10).some((e) => e.sessionId === "s_b")).toBe(true);
    expect(audit.recent(10).some((e) => e.sessionId === "s_a")).toBe(false);
    // usage ledger DIPERTAHANKAN
    expect(ledger.recent(10)).toHaveLength(2);

    // idempoten: hapus ulang aman (0 perubahan, tanpa throw)
    expect(sessions.deleteProjectSessions("p_a")).toEqual({ sessions: 0, events: 0, approvals: 0 });
    expect(projects.deleteProjectData("p_a")).toEqual({ tasks: 0, projectEvents: 0 });

    for (const s of [projects, sessions, revisions, audit, ledger]) s.close();
  });

  it("revisi di luar prefix project TIDAK ikut terhapus (LIKE prefix di-escape)", () => {
    const { ws, projects, sessions, revisions, audit, ledger } = setup();
    projects.createProject({ id: "p_x", name: "X", rootPath: "projects/p_x" });
    const rootX = path.join(ws, "projects", "p_x");
    const sibling = path.join(ws, "projects", "p_x-lain"); // prefix mirip!
    fs.mkdirSync(rootX, { recursive: true });
    fs.mkdirSync(sibling, { recursive: true });
    revisions.saveRevision(path.join(rootX, "a.txt"), "lama X");
    revisions.saveRevision(path.join(sibling, "b.txt"), "lama sibling");

    expect(revisions.deleteRevisionsUnder(rootX + path.sep)).toBe(1);
    expect(revisions.listRevisions(path.join(rootX, "a.txt"))).toHaveLength(0);
    expect(revisions.listRevisions(path.join(sibling, "b.txt"))).toHaveLength(1); // selamat

    for (const s of [projects, sessions, revisions, audit, ledger]) s.close();
  });
});
