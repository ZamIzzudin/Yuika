// P1-PRJ-3 (TASKS.md): roster project — project.yaml deklaratif, ter-replay via file.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProjectManifest } from "@yuika/contracts";
import { loadRoster, saveRoster } from "../project/roster.js";

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "yui-roster-"));
}

describe("roster project (project.yaml)", () => {
  it("tanpa project.yaml → roster kosong (bukan error)", () => {
    expect(loadRoster(tmpRoot())).toEqual([]);
  });

  it("save → load roundtrip; default fase/binding terisi", () => {
    const root = tmpRoot();
    saveRoster(root, [
      { personaId: "yui-conductor", role: "Orkestrator proyek", phases: ["planning"], mcp: [] },
      { personaId: "yui-coder", role: "Implementer utama", phases: [], mcp: [] }, // fase/mcp eksplisit kosong
    ]);
    const roster = loadRoster(root);
    expect(roster).toHaveLength(2);
    expect(roster[0]).toMatchObject({ personaId: "yui-conductor", role: "Orkestrator proyek", phases: ["planning"] });
    expect(roster[1]!.phases).toEqual([]); // default dari schema
    expect(roster[1]!.mcp).toEqual([]);
    // file benar-benar YAML terbaca manusia (deklaratif)
    const raw = fs.readFileSync(path.join(root, "project.yaml"), "utf-8");
    expect(raw).toContain("personaId: yui-coder");
  });

  it("yaml rusak / fase invalid → error zod jelas", () => {
    const root = tmpRoot();
    fs.writeFileSync(
      path.join(root, "project.yaml"),
      "roster:\n  - personaId: yui-coder\n    role: X\n    phases: [deploy]\n",
      "utf-8",
    );
    expect(() => loadRoster(root)).toThrow();
    expect(() => ProjectManifest.parse({ roster: [{ personaId: "yui-coder", role: "X", phases: ["nope"] }] })).toThrow();
  });

  it("save menimpa utuh (replace, bukan append)", () => {
    const root = tmpRoot();
    saveRoster(root, [{ personaId: "yui-scholar", role: "Riset", phases: [], mcp: [] }]);
    saveRoster(root, [{ personaId: "yui-coder", role: "Kode", phases: [], mcp: [] }]);
    expect(loadRoster(root).map((r) => r.personaId)).toEqual(["yui-coder"]);
  });
});
