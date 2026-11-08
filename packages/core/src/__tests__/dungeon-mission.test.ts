// P1-DUN-4: latihan buatan user, create (mission.yaml + folder), duplikat
// ditolak, append resource bahan ajar (dedupe), delete, sanitasi nama bahan.
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMission, appendMissionResource, deleteMission, loadMissions, sanitizeMaterialName } from "../dungeon/mission.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-mis-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const INPUT = {
  title: "Latih analisis produk",
  persona: "yui-analyst",
  goal: "Pelajari cara membandingkan fitur produk kompetitor dari file bahan ajar, lalu susun jadi prosedur.",
  resources: [],
  acceptance: ["Semua materi tercermin dalam skill", "Prosedur bisa diikuti tanpa baca ulang"],
  skillName: "Product Compare",
  skillDescription: "Membandingkan fitur produk kompetitor secara sistematis.",
};

describe("createMission (P1-DUN-4)", () => {
  it("menulis mission.yaml (origin user) + folder materials/reports/code → kebaca loadMissions", () => {
    const m = createMission(dir, INPUT);
    expect(m.id).toBe("product-compare"); // slug dari skillName
    expect(m.origin).toBe("user");
    const dungeon = path.join(dir, "dungeons", "product-compare");
    for (const sub of ["materials", "reports", "code"]) expect(fs.existsSync(path.join(dungeon, sub))).toBe(true);
    const loaded = loadMissions(dir).find((x) => x.id === "product-compare")!;
    expect(loaded.persona).toBe("yui-analyst");
    expect(loaded.targetSkill.name).toBe("Product Compare");
    expect(loaded.origin).toBe("user");
    expect(loaded.acceptance).toHaveLength(2);
  });

  it("duplikat slug → error jelas (bukan overwrite diam-diam)", () => {
    createMission(dir, INPUT);
    expect(() => createMission(dir, { ...INPUT, goal: "beda" })).toThrow(/sudah ada/);
  });

  it("appendMissionResource: bahan ajar tercatat sebagai sumber (dedupe); lalu delete bersih", () => {
    createMission(dir, INPUT);
    appendMissionResource(dir, "product-compare", "materials/bahan-1.md");
    appendMissionResource(dir, "product-compare", "materials/bahan-1.md"); // dedupe
    appendMissionResource(dir, "product-compare", "materials/data.xlsx");
    const m = loadMissions(dir).find((x) => x.id === "product-compare")!;
    expect(m.resources).toEqual(["materials/bahan-1.md", "materials/data.xlsx"]);
    expect(() => appendMissionResource(dir, "tidak-ada", "x")).toThrow(/tidak ditemukan/);
    deleteMission(dir, "product-compare");
    expect(loadMissions(dir).find((x) => x.id === "product-compare")).toBeUndefined();
    expect(() => deleteMission(dir, "product-compare")).toThrow(/tidak ditemukan/);
  });

  it("sanitizeMaterialName: karakter berbahaya → aman", () => {
    expect(sanitizeMaterialName('a../b\\c:d*e?f"g<h>i|.md')).toBe("a.._b_c_d_e_f_g_h_i_.md");
    expect(sanitizeMaterialName("  laporan final.pdf  ")).toBe("laporan final.pdf");
  });
});
