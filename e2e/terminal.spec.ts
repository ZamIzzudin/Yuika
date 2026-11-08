// · Agent Developer, GERBANG e2e ( egress + terminal).
// Bukti end-to-end user-facing:
//  T1 tab Terminal hidup (sesi via UI, user bisa mengetik → output muncul)
//  T2 agent menjalankan CLI (tool `terminal`, aman node -v) → output muncul
//     DI TAB YANG SAMA (sesi shared) tanpa approval
//  T3 perintah berisiko (npm publish) → APPROVAL card muncul → Approve once
//     → perintah jalan di sesi shared
// Shell deterministik: YUI_TERMINAL_CMD = echo-shell.mjs (fixture core).
// (Egress container nyata = integration test terpisah; butuh Docker, env e2e
//  ini tanpa Docker, jalur local fallback yang diuji di sini.)
import { expect, test, type APIRequestContext } from "@playwright/test";

const API = "http://127.0.0.1:3291";

async function enqueue(request: APIRequestContext, scripts: unknown[]): Promise<void> {
  const r = await request.post("http://127.0.0.1:3299/__script", { data: scripts });
  expect(r.ok()).toBeTruthy();
}

test.describe.configure({ mode: "serial" });

test("T1-T3, terminal shared user & agent + approval perintah berisiko", async ({ page, request }) => {
  test.setTimeout(180_000);

  await enqueue(request, [
    { text: "Terminal batch start.", toolCalls: [{ id: "call_t1", name: "terminal", args: { command: "node -v" } }] },
    { text: "Risky next.", toolCalls: [{ id: "call_t2", name: "terminal", args: { command: "npm publish --dry-run" } }] },
    { text: "Terminal batch complete." },
  ]);

  await page.goto("/");

 // ── project "Terminal Batch" + tab Terminal (++: terminal penuh) ──
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByPlaceholder("Project Name").fill("Terminal Batch");
  await page.getByRole("button", { name: "Create", exact: true }).click();
 // create → auto-open TeamSetup; tab Terminal HIDDEN sampai
  // Hiro/Neo di-assign (hemat resource docker) → assign Hiro lalu mulai sesi
  // dengannya (tab bar muncul setelah sesi pertama ada).
  await page.getByRole("button", { name: "Hiro Yui", exact: true }).click();
  await page.getByRole("button", { name: "Start Session" }).click();
  await expect(page.getByRole("tab", { name: "Terminal" })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("tab", { name: "Terminal" }).click();
  await expect(page.getByTestId("terminal-holder")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("● live")).toBeVisible({ timeout: 30_000 });

  // sesi tunggal per project (dibuat tab), ambil id utk polling buffer
  const sess = (await (await request.get(`${API}/api/terminal/sessions`)).json()) as {
    sessions: { id: string; createdAt: number }[];
  };
  // e2e.db persist antar run → project "Terminal Batch" lama punya sesi sendiri;
  // sesi project BARU = yang paling baru dibuat (tab barusan membukanya).
  const newest = [...sess.sessions].sort((a, b) => b.createdAt - a.createdAt)[0];
  expect(newest).toBeTruthy();
  const termId = newest!.id;
  const buffer = async (): Promise<string> => {
    const r = await request.get(`${API}/api/terminal/sessions/${termId}/buffer`);
    return ((await r.json()) as { buffer: string }).buffer;
  };

  // ── T1: user mengetik di tab → output ECHO muncul (sesi jalan) ──────
  await page.getByTestId("terminal-holder").click();
  await page.keyboard.type("echo user-first");
  await page.keyboard.press("Enter");
  await expect.poll(buffer, { timeout: 15_000 }).toContain("ECHO:echo user-first");

  // ── T2: agent menjalankan node -v via tool terminal ─────────────────
  // Scope project → PROJECT LEAD (Conductor/Maestro) otomatis, tak ada kartu
  // persona (kartu hanya di Freespace); toolset conductor kini punya terminal.
  await page.getByRole("tab", { name: "Chat" }).click();
  await expect(page.getByPlaceholder(/Describe a task/)).toBeVisible({ timeout: 30_000 });
  await page.getByPlaceholder(/Describe a task/).fill("Run node -v in the shared terminal.");
  await page.keyboard.press("Enter");

  // output agent muncul di buffer sesi YANG SAMA (shared), tanpa approval
  await expect.poll(buffer, { timeout: 60_000 }).toContain("ECHO:node -v");

  // ── T3: perintah berisiko → approval card → Approve once ────────────
  const card = page.locator("div").filter({ hasText: "npm publish" }).first();
  await expect(card.getByRole("button", { name: "Approve once" })).toBeVisible({ timeout: 60_000 });
  await card.getByRole("button", { name: "Approve once" }).click();
  await expect(page.locator("div").filter({ hasText: "npm publish" }).getByText("Approved").first()).toBeVisible({ timeout: 30_000 });

  // perintah berjalan di sesi shared + jawaban final tampil
  await expect.poll(buffer, { timeout: 30_000 }).toContain("ECHO:npm publish");
  await expect(page.getByText("Terminal batch complete.").first()).toBeVisible({ timeout: 60_000 });
});
