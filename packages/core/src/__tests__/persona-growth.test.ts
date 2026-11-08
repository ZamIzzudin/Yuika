// growth persona, level & statistik DIKURASI dari data nyata
// (sessions / events persona.state done / project_tasks done). Tidak ada
// jalur menaikkan level selain benar-benar bekerja.
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildPersonaGrowth, GROWTH_LEVELS } from "../personas/growth.js";
import { SessionStore } from "../session/store.js";
import { ProjectStore } from "../project/store.js";
import type { EventDraft } from "@yuika/contracts";

let dir: string;
let store: SessionStore;
let projects: ProjectStore;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-growth-"));
  store = new SessionStore(path.join(dir, "s.db"));
  projects = new ProjectStore(path.join(dir, "p.db"));
});
afterEach(() => {
  store.close();
  projects.close();
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* lenient */
  }
});

function seed(personaId: string, doneTurns: number, projectId?: string) {
  store.createSession(`s_${personaId}`, personaId, "SYS", [], projectId ?? null);
  for (let i = 0; i < doneTurns; i++) {
    store.appendEvent(`s_${personaId}`, {
      type: "persona.state",
      personaId,
      state: "done",
    } as unknown as EventDraft);
  }
}

describe("buildPersonaGrowth ()", () => {
  it("level naik mengikuti kurva turns; null next di level maksimum", () => {
    seed("yui-scholar", 0);
    seed("yui-coder", 20);
    seed("yui-conductor", 200);
    const g = new Map(buildPersonaGrowth(
      [
        { id: "yui-scholar", name: "Scholar", domain: "research" },
        { id: "yui-coder", name: "Coder", domain: "code" },
        { id: "yui-conductor", name: "Conductor", domain: "orchestration" },
      ],
      store,
      projects,
    ).map((x) => [x.id, x]));
    expect(g.get("yui-scholar")!.level).toBe("Baru");
    expect(g.get("yui-scholar")!.nextLevelAt).toBe(15);
    expect(g.get("yui-coder")!.level).toBe("Berkembang");
    expect(g.get("yui-conductor")!.level).toBe("Ahli");
    expect(g.get("yui-conductor")!.nextLevelAt).toBeNull();
    expect(g.get("yui-scholar")!.sessions).toBe(1);
  });

  it("hanya turn DONE yang dihitung, state running/cancelled tidak menaikkan", () => {
    store.createSession("s_x", "yui-scribe", "SYS", []);
    for (const state of ["thinking", "working", "awaiting_input", "done", "error", "celebrating", "idle"]) {
      store.appendEvent("s_x", { type: "persona.state", personaId: "yui-scribe", state } as unknown as EventDraft);
    }
    const g = buildPersonaGrowth([{ id: "yui-scribe", name: "Scribe", domain: "writing" }], store, projects)[0]!;
    expect(g.turns).toBe(1);
  });

  it("task done terhitung hanya untuk assignee & status done", () => {
    projects.createProject({ id: "p1", name: "Demo", rootPath: "projects/demo" });
    const t = (title: string, assignee: string) => projects.createTask({ id: `t_${title}`, projectId: "p1", title, assignee }).id;
    const tA = t("a", "yui-coder");
    const tB = t("b", "yui-coder");
    const tC = t("c", "yui-designer");
    projects.updateTask(tB, { status: "done" });
    projects.updateTask(tC, { status: "done" }); // tA tetap todo
    const list = buildPersonaGrowth(
      [
        { id: "yui-coder", name: "Coder", domain: "code" },
        { id: "yui-designer", name: "Designer", domain: "design" },
      ],
      store,
      projects,
    );
    expect(list.find((g) => g.id === "yui-coder")!.tasksDone).toBe(1);
    expect(list.find((g) => g.id === "yui-designer")!.tasksDone).toBe(1);
  });

  it("kurva level monoton naik & dimulai dari 0", () => {
    expect(GROWTH_LEVELS[0]!.at).toBe(0);
    for (let i = 1; i < GROWTH_LEVELS.length; i++) {
      expect(GROWTH_LEVELS[i]!.at).toBeGreaterThan(GROWTH_LEVELS[i - 1]!.at);
    }
  });
});
