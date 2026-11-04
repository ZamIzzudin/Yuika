import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetRegistryForTests } from "../registry.js";
import { registerSkillTools } from "../tools/skill-tools.js";
import { acceptDraft, listDrafts, proposeSkill, rejectDraft, slugify, updateDraft } from "../skills/manager.js";
import { listSkills } from "../skills/loader.js";

let dir: string;

describe("skill lifecycle (P1-MEM-3)", () => {
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-skills-"));
  });

  it("slugify: nama → kebab-case aman folder", () => {
    expect(slugify("Landing Page Flow!")).toBe("landing-page-flow");
    expect(slugify("  --..-- ")).toBe("");
  });

  it("propose → draft tampil, TIDAK di skills aktif", () => {
    proposeSkill(dir, "Landing Page Flow", "Saat membangun landing page satu file", "# Langkah\n1. riset gaya\n2. tulis html");
    const drafts = listDrafts(dir);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.name).toBe("Landing Page Flow");
    expect((drafts[0]!.frontmatter.metadata as { yui?: { status?: string } } | undefined)?.yui?.status).toBe("draft");
    expect(listSkills(dir)).toHaveLength(0); // drafts/ tak terhitung aktif
  });

  it("duplikat nama ditolak (aktif maupun draft)", () => {
    proposeSkill(dir, "Flow A", "deskripsi cukup panjang", "body instruksi cukup panjang minimal");
    expect(() => proposeSkill(dir, "Flow A", "deskripsi lain", "body lain")).toThrow(/sudah ada/);
    acceptDraft(dir, "flow-a");
    expect(() => proposeSkill(dir, "Flow A", "deskripsi lain", "body lain")).toThrow(/sudah ada/);
  });

  it("accept: lint + pindah → aktif & siap dipakai (skills_list)", () => {
    proposeSkill(dir, "Flow B", "Prosedur valid", "1. langkah\n2. langkah");
    const r = acceptDraft(dir, "flow-b");
    expect(r.name).toBe("Flow B");
    expect(listDrafts(dir)).toHaveLength(0);
    const active = listSkills(dir);
    expect(active).toHaveLength(1);
    expect(active[0]!.name).toBe("Flow B");
    expect((active[0]!.frontmatter.metadata as { yui?: { status?: string } } | undefined)?.yui?.status).toBe("tested"); // P1-DUN-2: accept = tested (eval DUN-3 → ready)
  });

  it("update draft sebelum accept (validasi user)", () => {
    proposeSkill(dir, "Flow C", "deskripsi awal", "body awal");
    updateDraft(dir, "flow-c", "Flow C Final", "deskripsi revisi user", "body revisi");
    const d = listDrafts(dir);
    expect(d[0]!.name).toBe("Flow C Final");
    expect(d[0]!.body).toBe("body revisi");
  });

  it("reject: hapus draft", () => {
    proposeSkill(dir, "Flow D", "deskripsi", "body");
    rejectDraft(dir, "flow-d");
    expect(listDrafts(dir)).toHaveLength(0);
    expect(fs.existsSync(path.join(dir, "drafts", "flow-d"))).toBe(false);
  });

  it("tool skill_propose: tulis draft + emit skill.proposed", async () => {
    resetRegistryForTests();
    registerSkillTools(dir);
    const emitted: { type: string; name: string }[] = [];
    const { registry } = await import("../registry.js");
    const res = await registry.dispatch(
      "skill_propose",
      { name: "Deploy Check", description: "Sebelum deploy, cek lint & build", body: "1. npm run typecheck\n2. npm test\n3. build", source: "sesi landing page" },
      { sessionId: "s1", turnId: "t1", workspacePath: dir, emit: (d) => emitted.push(d as { type: string; name: string }), requestApproval: async () => true },
    );
    expect(res.isError).toBeFalsy();
    expect(listDrafts(dir)).toHaveLength(1);
    expect(emitted[0]!.type).toBe("skill.proposed");
    expect(emitted[0]!.name).toBe("Deploy Check");
  });
});

describe("skill usage tracking (P1-MEM-4)", () => {
  it("skill_view → views++; updateDraft → patches++ (ikut pindah saat accept)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-sk-u-"));
    resetRegistryForTests();
    registerSkillTools(dir);
    proposeSkill(dir, "Usage Flow", "Cek usage tracking", "1. langkah\n2. langkah");
    updateDraft(dir, "usage-flow", "Usage Flow", "deskripsi revisi", "body revisi");
    const { registry } = await import("../registry.js");
    await registry.dispatch("skill_view", { name: "Usage Flow" }, { sessionId: "s1", turnId: "t1", workspacePath: dir, emit: () => {}, requestApproval: async () => true });
    // belum aktif → skill_view tak menemukan skill (draft tidak ter-list) → views tetap 0 di folder
    acceptDraft(dir, "usage-flow");
    await registry.dispatch("skill_view", { name: "Usage Flow" }, { sessionId: "s1", turnId: "t1", workspacePath: dir, emit: () => {}, requestApproval: async () => true });
    const { readUsage } = await import("../skills/manager.js");
    const u = readUsage(path.join(dir, "usage-flow"));
    expect(u.views).toBe(1); // dari skill_view setelah aktif
    expect(u.patches).toBe(2); // updateDraft + accept
  });
});
