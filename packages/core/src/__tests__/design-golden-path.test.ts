// P2-DSN-6: golden path E2E F3 — design (Picasso) → develop v1 (Hiro) →
// edit user → regenerate v2 (Hiro) → diff. Loop dua arah diverifikasi di
// level tool yang benar-benar dipakai persona (design_* + write_file +
// read_file via registry; user edit via jalur store/canvas). Tanpa LLM:
// niat LLM disimulasikan helper `componentFor` (nama shape = kontrak,
// warna berulang = token — sesuai skill design-to-code-handoff).
import { it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registry, resetRegistryForTests } from "../registry.js";
import { registerDesignTools } from "../tools/design-tools.js";
import { registerFileTools } from "../tools/file-tools.js";
import { updateDesignShape, getDesignFile } from "../design/store.js";
import { diffLines, diffStat } from "../project/diff.js";

let ws: string = "";
beforeEach(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "yui-golden-"));
  resetRegistryForTests();
  registerDesignTools(ws);
  registerFileTools();
});
afterEach(() => fs.rmSync(ws, { recursive: true, force: true }));

const ctx = { sessionId: "s", turnId: "t", workspacePath: ws, emit: () => {}, requestApproval: async () => true };
const run = async (name: string, args: unknown) => {
  const res = await registry.dispatch(name, args, ctx);
  const r = res.result as Record<string, unknown>;
  if (res.isError) throw new Error(String(r.error));
  return r;
};

/** Generate ala Hiro: komponen React dari ringkasan desain (accent = fill tombol). */
const componentFor = (screen: string, accent: string) =>
  [
    `// Generated from design file (screen: ${screen}).`,
    `export const ACCENT = "${accent}";`,
    `export function ${screen}() {`,
    `  return <button style={{ background: ACCENT, padding: "12px 24px", borderRadius: 10 }}>Sign in</button>;`,
    `}`,
  ].join("\n");

it("golden path: design → develop v1 → user edit → develop v2 → diff menampilkan perubahan", async () => {
  // ---- 1) DESIGN: Picasso menggambar login mobile via design_* tools ----
  const f = (await run("design_create_file", { name: "Login Mobile" })) as {
    fileId: string;
    page: { id: string };
    revn: number;
  };
  const frame = (await run("design_add_shape", {
    fileId: f.fileId,
    pageId: f.page.id,
    shape: { type: "frame", name: "LoginScreen", x: 0, y: 0, width: 390, height: 844, fill: "#101014" },
  })) as { id: string };
  const btn = (await run("design_add_shape", {
    fileId: f.fileId,
    pageId: f.page.id,
    parentId: frame.id,
    shape: { type: "rect", name: "Button Sign in", x: 48, y: 520, width: 294, height: 48, fill: "#007cf7", radius: 10 },
  })) as { id: string };

  // ---- 2) DEVELOP v1: Hiro baca ringkasan → generate komponen ----
  const list = (await run("design_list", {})) as { files: Array<{ fileId: string; name: string }> };
  expect(list.files.map((x) => x.name)).toContain("Login Mobile");
  const got1 = await run("design_get_file", { fileId: f.fileId });
  const btn1 = JSON.stringify(got1);
  expect(btn1).toContain('"Button Sign in"');
  expect(btn1).toContain("#007cf7"); // ringkasan kaya membawa fill → sumber token
  const v1 = componentFor("LoginScreen", "#007cf7");
  const w1 = (await run("write_file", { path: "code/demo/src/LoginScreen.tsx", content: v1 })) as {
    path: string;
    bytes: number;
  };
  expect(w1.path).toBe("code/demo/src/LoginScreen.tsx");

  // ---- 3) USER EDIT: via jalur canvas (store) — revn naik ----
  updateDesignShape(ws, f.fileId, f.page.id, btn.id, { fill: "#5865f2" });
  const edited = getDesignFile(ws, f.fileId)!;
  expect(edited.revn).toBeGreaterThan(f.revn);
  // Hiro baca ulang: perubahan user terlihat (dua arah)
  const got2 = JSON.stringify(await run("design_get_file", { fileId: f.fileId }));
  expect(got2).toContain("#5865f2");
  expect(got2).not.toContain("#007cf7");

  // ---- 4) REGENERATE v2 + DIFF (tab Files) ----
  const v2 = componentFor("LoginScreen", "#5865f2");
  await run("write_file", { path: "code/demo/src/LoginScreen.tsx", content: v2 });
  const read = (await run("read_file", { path: "code/demo/src/LoginScreen.tsx" })) as { content: string };
  expect(read.content).toContain("#5865f2");
  const ops = diffLines(v1, v2);
  const stat = diffStat(ops);
  expect(stat.added).toBeGreaterThan(0);
  expect(stat.removed).toBeGreaterThan(0);
  expect(ops.some((o) => o.t === "+" && o.line.includes("#5865f2"))).toBe(true);
  expect(ops.some((o) => o.t === "-" && o.line.includes("#007cf7"))).toBe(true);
});

it("golden path: edit user tetap dibaca persona BARU baca file (revn/persistence lintas store)", async () => {
  // File JSON bertahan di disk → sesi/persona berikutnya (mis. Hiro session baru)
  // melihat hasil edit, bukan snapshot lama.
  const f = (await run("design_create_file", { name: "Flow Checkout" })) as {
    fileId: string;
    page: { id: string };
  };
  const t = (await run("design_add_shape", {
    fileId: f.fileId,
    pageId: f.page.id,
    shape: { type: "text", name: "Title Checkout", x: 0, y: 0, width: 300, height: 40, text: "Checkout" },
  })) as { id: string };
  expect(fs.existsSync(path.join(ws, "design", `${f.fileId}.json`))).toBe(true);
  updateDesignShape(ws, f.fileId, f.page.id, t.id, { text: "Checkout Sekarang" });
  // "sesi baru" = registry dibuat ulang atas workspace yang sama
  resetRegistryForTests();
  registerDesignTools(ws);
  const got = JSON.stringify(await run("design_get_file", { fileId: f.fileId }));
  expect(got).toContain("Checkout Sekarang");
});
