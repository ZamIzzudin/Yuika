// P1-PER-6 + P2-PM-1 + P1-PER-8: roster D9+D22+D26 = 9 persona — manifest
// valid, delegation rules koheren (semua id yang dirujuk ada — mencegah typo
// seperti `yui_designer`), dan toolset persona baru ekspos tool yang terdaftar.
import { describe, expect, it } from "vitest";
import path from "node:path";
import { listPersonas } from "../personas/loader.js";
import { registry } from "../registry.js";
import { registerQaTools } from "../tools/qa-tools.js";

const personasDir = path.resolve(__dirname, "../../../../packages/personas");

describe("persona roster D9 (P1-PER-6)", () => {
  const personas = listPersonas(personasDir);
  const ids = personas.map((p) => p.manifest.id);

  it("9 persona ter-load: conductor + 7 spesialis + planner (P2-PM-1 D22 + P1-PER-8 D26)", () => {
    expect(ids.sort()).toEqual(["yui-analyst", "yui-coder", "yui-conductor", "yui-designer", "yui-operator", "yui-planner", "yui-scholar", "yui-scribe", "yui-sherlock"]);
    expect(personas.every((p) => p.manifest.description.length <= 120)).toBe(true); // kontrak zod memaksa, guard tipologi
  });

  it("delegation rules koheren — semua id di can_spawn/spawnable_by dikenal (atau 'user')", () => {
    const known = new Set([...ids, "user"]);
    for (const p of personas) {
      for (const id of p.manifest.delegation.can_spawn) expect(known.has(id), `${p.manifest.id} can_spawn → ${id} tidak dikenal`).toBe(true);
      for (const id of p.manifest.delegation.spawnable_by) expect(known.has(id), `${p.manifest.id} spawnable_by → ${id} tidak dikenal`).toBe(true);
    }
    // conductor bisa mem-spawn SEMUA spesialis (orkestrator penuh)
    const conductor = personas.find((p) => p.manifest.id === "yui-conductor")!;
    for (const spec of ids.filter((i) => i !== "yui-conductor")) {
      expect(conductor.manifest.delegation.can_spawn).toContain(spec);
    }
  });

  it("Analyst: dokumen data + run_command; Operator: terminal + MCP wildcard", () => {
    const analyst = personas.find((p) => p.manifest.id === "yui-analyst")!;
    expect(analyst.manifest.tools).toContain("doc_read");
    expect(analyst.manifest.tools).toContain("run_command");
    const operator = personas.find((p) => p.manifest.id === "yui-operator")!;
    expect(operator.manifest.tools).toContain("run_command");
    expect(operator.manifest.tools).toContain("mcp__*");
  });

  it("WKS-4: coder + operator punya run_in_workshop (container persist); persona lain TIDAK", () => {
    for (const id of ["yui-coder", "yui-operator"]) {
      const p = personas.find((x) => x.manifest.id === id)!;
      expect(p.manifest.tools).toContain("run_in_workshop");
    }
    const conductor = personas.find((p) => p.manifest.id === "yui-conductor")!;
    expect(conductor.manifest.tools).not.toContain("run_in_workshop");
  });

  it("SCR-6 amandemen user: Analyst bisa MENONTON live screen (bukan hanya rekonstruksi riwayat) — verdict tetap milik Sherlock", () => {
    const analyst = personas.find((p) => p.manifest.id === "yui-analyst")!;
    expect(analyst.manifest.tools).toContain("qa_watch");
    expect(analyst.manifest.tools).toContain("qa_snapshot");
    // verdict QA = domain Sherlock
    expect(analyst.manifest.tools).not.toContain("qa_check");
    // panduan di PERSONA.md: pertanyaan "apa yang dibuka X di browser"
    // dijawab live-watch dulu, bukan rekonstruksi riwayat
    expect(analyst.personaMd).toContain("do not reconstruct from session history");
  });

  it("P2-PM-1 (D22): Planner — PM bukan eksekutor; consult + task tools; konsultasi hanya ke 3 penasihat", () => {
    const planner = personas.find((p) => p.manifest.id === "yui-planner")!;
    expect(planner.manifest.tools).toContain("consult"); // brainstorm terstruktur
    expect(planner.manifest.tools).toContain("todo_add"); // task list detail
    expect(planner.manifest.tools).toContain("write_file"); // dokumen perencanaan
    // Planner TIDAK mendelegasikan eksekusi (itu ranah Conductor) — hanya konsultasi:
    expect(planner.manifest.tools).not.toContain("delegate_task");
    expect(planner.manifest.delegation.can_spawn.sort()).toEqual(["yui-analyst", "yui-scholar", "yui-scribe"]);
    // dipanggil user langsung ATAU didelegasikan Conductor (fase planning di workflow nanti)
    expect(planner.manifest.delegation.spawnable_by).toContain("user");
    expect(planner.manifest.delegation.spawnable_by).toContain("yui-conductor");
    // PM discipline ada di PERSONA.md
    expect(planner.personaMd).toContain("acceptance");
  });

  it("P1-PER-8 (D26): Sherlock — QA watcher read-only; QA tools + tanpa tool eksekusi browser", () => {
    const sherlock = personas.find((p) => p.manifest.id === "yui-sherlock")!;
    // SCR-6 tools ekspos
    for (const t of ["qa_watch", "qa_snapshot", "qa_check"]) {
      expect(sherlock.manifest.tools, `sherlock toolset → ${t}`).toContain(t);
    }
    // Dia TIDAK menyetir browser (bukan driver — watcher): tanpa lease tools
    for (const t of ["browser_open", "browser_click", "browser_type", "request_login", "request_takeover"]) {
      expect(sherlock.manifest.tools).not.toContain(t);
    }
    // Verifikasi = baca artefak + reproduce via command
    expect(sherlock.manifest.tools).toContain("run_command");
    // Leaf executor: dipanggil user atau Conductor; tak men-spawn siapa pun
    expect(sherlock.manifest.delegation.can_spawn).toEqual([]);
    expect(sherlock.manifest.delegation.spawnable_by.sort()).toEqual(["user", "yui-conductor"]);
    // Disiplin detektif ada di PERSONA.md
    expect(sherlock.personaMd).toContain("Reproduce, isolate, verify");
    // QA tools terdaftar di registry (terpasang runtime)
    registerQaTools();
    for (const t of ["qa_watch", "qa_snapshot", "qa_check"]) {
      expect(registry.has(t), `registry → ${t}`).toBe(true);
    }
  });
});
