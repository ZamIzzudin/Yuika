// W2-C2 + W5-C2 (TASKS.md): prompt stack frozen per sesi; USER.md stub.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SessionStore } from "../session/store.js";
import { createSessionWithPrompt } from "../runtime-helpers.js";
import { buildSystemPrompt, CORE_SYSTEM_PROMPT } from "../prompt/builder.js";
import { loadPersona } from "../personas/loader.js";
import { listSkills } from "../skills/loader.js";
import { appendUserPreferenceNote, userMdPath } from "../memory/usermd.js";

/** Fixture persona + skills mini di tmp dir (isolasi dari data repo). */
function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-prompt-"));
  const personasDir = path.join(dir, "personas");
  const skillsDir = path.join(dir, "skills");
  const pDir = path.join(personasDir, "yui-test");
  fs.mkdirSync(pDir, { recursive: true });
  fs.writeFileSync(path.join(pDir, "persona.yaml"), 'id: yui-test\nname: "Yui Test"\nversion: 0.1.0\nexpertise: testing\ndescription: "Persona fixture."\nmemory:\n  domain: testing\n  learn: false\n', "utf-8");
  fs.writeFileSync(path.join(pDir, "PERSONA.md"), "Kamu persona fixture — selalu menjawab singkat.", "utf-8");
  fs.writeFileSync(path.join(pDir, "toolsets.yaml"), "tools: [read_file]\n", "utf-8");
  fs.writeFileSync(path.join(pDir, "skills.yaml"), "bundled: [fixture-skill]\n", "utf-8");
  fs.writeFileSync(path.join(pDir, "delegation.yaml"), "spawnable_by: [user]\n", "utf-8");
  const s1 = path.join(skillsDir, "fixture-skill");
  fs.mkdirSync(s1, { recursive: true });
  fs.writeFileSync(path.join(s1, "SKILL.md"), '---\nname: fixture-skill\ndescription: "Skill fixture untuk test."\n---\nIsi skill fixture.\n', "utf-8");
  return { dir, personasDir, skillsDir, pDir, skillsDir2: skillsDir };
}

describe("prompt stack frozen per sesi (W2-C2)", () => {
  it("stack = [core][PERSONA.md][skills index persona]; tersimpan utuh di sessions", () => {
    const { personasDir, skillsDir } = makeFixture();
    const persona = loadPersona(path.join(personasDir, "yui-test"));
    const store = new SessionStore(path.join(path.dirname(personasDir), "test.db"));
    createSessionWithPrompt(store, persona, "s1", persona.manifest.tools, skillsDir);

    const stored = store.getSession("s1")!.systemPrompt;
    expect(stored).toContain(CORE_SYSTEM_PROMPT);
    expect(stored).toContain("Kamu persona fixture — selalu menjawab singkat.");
    expect(stored).toContain("fixture-skill: Skill fixture untuk test.");
    // identik dengan builder langsung (tidak ada lapisan lain yang diselipkan)
    const index = listSkills(skillsDir);
    expect(stored).toBe(buildSystemPrompt(persona, index));
    store.close();
  });

  it("FROZEN: config berubah SETELAH sesi dibuat → prompt sesi lama tidak berubah; sesi baru dapat config baru", () => {
    const { personasDir, skillsDir } = makeFixture();
    const persona = loadPersona(path.join(personasDir, "yui-test"));
    const store = new SessionStore(path.join(path.dirname(personasDir), "test.db"));
    createSessionWithPrompt(store, persona, "s1", persona.manifest.tools, skillsDir);
    const frozenPrompt = store.getSession("s1")!.systemPrompt;

    // config berubah: persona prompt di-edit + skill baru di-bundle
    fs.writeFileSync(path.join(personasDir, "yui-test", "PERSONA.md"), "PROMPT BARU SETELAH SESI 1.", "utf-8");
    fs.writeFileSync(path.join(personasDir, "yui-test", "skills.yaml"), "bundled: [fixture-skill, skill-baru]\n", "utf-8");
    const s2 = path.join(skillsDir, "skill-baru");
    fs.mkdirSync(s2, { recursive: true });
    fs.writeFileSync(path.join(s2, "SKILL.md"), '---\nname: skill-baru\ndescription: "Skill baru."\n---\nIsi baru.\n', "utf-8");

    // sesi lama tetap frozen
    expect(store.getSession("s1")!.systemPrompt).toBe(frozenPrompt);
    // sesi baru membaca config terbaru
    const personaV2 = loadPersona(path.join(personasDir, "yui-test"));
    createSessionWithPrompt(store, personaV2, "s2", personaV2.manifest.tools, skillsDir);
    const p2 = store.getSession("s2")!.systemPrompt;
    expect(p2).toContain("PROMPT BARU SETELAH SESI 1.");
    expect(p2).toContain("skill-baru: Skill baru.");
    expect(p2).not.toBe(frozenPrompt);
    store.close();
  });
});

describe("USER.md stub (W5-C2)", () => {
  it("1 catatan preferensi (label preview) per sesi; header sekali; tidak menimpa edit user", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-usermd-"));
    appendUserPreferenceNote(dir, "Maestro Yui");
    const first = fs.readFileSync(userMdPath(dir), "utf-8");
    expect(first).toContain("# USER.md");
    expect(first).toContain("(preview)");
    expect(first).toContain("Maestro Yui");

    // user mengedit isi — harus terjaga
    fs.appendFileSync(userMdPath(dir), "- preferensi manual user: suka bullet point.\n", "utf-8");

    appendUserPreferenceNote(dir, "Pierre Yui");
    const second = fs.readFileSync(userMdPath(dir), "utf-8");
    expect(second).toContain("preferensi manual user");
    expect(second).toContain("Pierre Yui");
    expect(second.match(/\(preview\)/g)).toHaveLength(2); // +1 per sesi
  });
});
