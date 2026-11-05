// Mapping manual skill → persona (menu Dungeon, feedback user dev-10):
// effective = (bundled ∪ attached ∪ global) \ detached — dipakai index prompt
// sesi baru; detach bisa melepas bawaan; attach membatalkan detach.
import { describe, expect, it } from "vitest";
import { effectiveSkillNames, applyBindingAction, loadSkillBindings, saveSkillBindings } from "../skills/bindings.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("skill bindings (mapping manual)", () => {
  it("effective: bundled ∪ attached ∪ global, dikurangi detached", () => {
    const names = effectiveSkillNames(
      ["code-review-basics", "yui-conventions"], // bawaan skills.yaml
      { attached: ["web-research"], detached: ["yui-conventions"] }, // manual
      "global-skill", // skill global (personas: undefined)
    );
    expect([...names].sort()).toEqual(["code-review-basics", "global-skill", "web-research"]);
  });

  it("attach skill non-bawaan; detach bawaan; attach membatalkan detach bawaan", () => {
    const bundled = ["code-review-basics"];
    const a = applyBindingAction(undefined, "web-research", bundled, "attach");
    expect(a).toEqual({ attached: ["web-research"], detached: [] });
    const b = applyBindingAction(a, "code-review-basics", bundled, "detach"); // lepas bawaan
    expect(b.detached).toContain("code-review-basics");
    const c = applyBindingAction(b, "code-review-basics", bundled, "attach"); // pasang lagi
    expect(c.detached).not.toContain("code-review-basics");
  });

  it("detach skill non-bawaan satu-satunya → binding bersih (no-op dirapikan)", () => {
    const b = applyBindingAction({ attached: [], detached: [] }, "web-research", ["other"], "detach");
    expect(b).toEqual({ attached: [], detached: [] }); // tak menumpuk entry tak bermakna
  });

  it("persist roundtrip: save → load (file rusak → kosong, bundled tetap jalan)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-bind-"));
    const file = path.join(dir, "skill-bindings.json");
    saveSkillBindings(file, { "yui-coder": { attached: ["web-research"], detached: [] } });
    expect(loadSkillBindings(file)["yui-coder"]).toEqual({ attached: ["web-research"], detached: [] });
    fs.writeFileSync(file, "bukan json", "utf-8");
    expect(loadSkillBindings(file)).toEqual({}); // fail-soft
  });
});
