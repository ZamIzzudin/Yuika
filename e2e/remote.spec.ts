// P1-PRT-6 — GERBANG remote control (Batch 1 · Remote Control).
// Bukti end-to-end via /dev/remote (browser kedua = device remote sejati,
// kunci WebCrypto di browser) terhadap host apps/api + SpecRelay double
// (semantik SPEC-PROTOCOL v1). Live run vs relay yuika-portal menyusul
// gerbang "PORTAL READY FOR INTEGRATION" (docs/portal/README.md).
//
// Skenario (SPEC §11 adaptasi gerbang lintas proses):
//  G1 host pair (REST /api/portal/pair → claim stub → relay register)
//  G2 remote pair+join dari browser (auto), host terlihat di list_hosts
//  G3 send_prompt → delta streaming tampil di remote (mock provider)
//  G4 approval remote: write_file minta persetujuan → Approve dari remote
//  G5 resume: reload remote → re-pair tidak perlu → snapshot sesi tampil
//  G6 dua remote live bersamaan sesi sama (status host = 2 remote)
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API = "http://127.0.0.1:3291";
const PORTAL = "http://127.0.0.1:3110";
const RELAY = "ws://127.0.0.1:3111";

const STREAM_TEXT = "Remote control works and this answer streams over the encrypted relay.";

/** Antri jawaban mock (FIFO). */
async function enqueue(request: APIRequestContext, scripts: unknown[]): Promise<void> {
  const r = await request.post("http://127.0.0.1:3299/__script", { data: scripts });
  expect(r.ok()).toBeTruthy();
}

function openRemote(page: Page, token: string, name: string): Promise<Page> {
  const url = `/dev/remote?auto=1&portal=${encodeURIComponent(PORTAL)}&relay=${encodeURIComponent(RELAY)}&token=${encodeURIComponent(token)}&name=${encodeURIComponent(name)}`;
  return page.goto(url).then(() => page);
}

test.describe.configure({ mode: "serial" });

test("G1 — host pair via REST (claim stub) → relay host online", async ({ request }) => {
  const r = await request.post(`${API}/api/portal/pair`, {
    data: { token: "tok_host_e2e_000000000001", portalUrl: PORTAL, relayUrl: RELAY, name: "E2E host" },
  });
  expect(r.ok()).toBeTruthy();
  const body = (await r.json()) as { deviceId: string; accountId: string };
  expect(body.deviceId).toMatch(/^dev_[0-9a-f]{16}$/);

  await expect
    .poll(async () => {
      const st = await (await request.get(`${API}/api/portal/status`)).json();
      return st.relayState;
    }, { timeout: 15_000 })
    .toBe("authed");
});

test("G2-G6 — remote browser: join, stream, approve, resume, dua remote", async ({ page, context, request }) => {
  test.setTimeout(180_000);

  // Script provider: prompt#1 teks stream; prompt#2 toolCall write_file (approval)
  // lalu teks penutup.
  await enqueue(request, [
    { text: STREAM_TEXT },
    { toolCalls: [{ id: "call_w1", name: "write_file", args: { path: "notes/remote-note.txt", content: "approved from remote" } }] },
    { text: "File written after remote approval." },
  ]);

  // ── G2: remote 1 pair + connect + join host pertama ──────────────────
  const logs: string[] = [];
  page.on("console", (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 200)}`));
  await openRemote(page, "tok_remote1_e2e_0000000001", "Remote 1");
  await expect(page.getByText(/joined/i).first()).toBeVisible({ timeout: 30_000 });

  // host status: 1 remote connected
  await expect
    .poll(async () => {
      const st = await (await request.get(`${API}/api/portal/status`)).json();
      return (st.remotes as unknown[]).length;
    }, { timeout: 15_000 })
    .toBe(1);

  // ── G3: prompt pertama → delta streaming terlihat ────────────────────
  // Sesi BARU via New session + persona Yui Coder (punya write_file utk
  // G4) — deterministik, tak tergantung sesi leftover run lain.
  await page.getByRole("button", { name: "New session" }).click();
  await page.getByRole("combobox").selectOption({ label: "Hiro Yui" });
  const input = page.getByPlaceholder(/First prompt creates a session|Message the host/);
  await input.fill("Say the remote proof sentence.");
  await input.press("Enter");
  await expect(page.getByText(/streams over the encrypted relay/)).toBeVisible({ timeout: 60_000 });

  // ── G4: approval remote — write_file minta persetujuan ───────────────
  // Paksa mode "ask" (approval-mode.json persist antar run bisa "auto").
  const modeRes = await request.put(`${API}/api/settings/approval`, { data: { mode: "ask" } });
  expect(modeRes.ok()).toBeTruthy();
  await page.getByPlaceholder(/Message the host/).fill("Write a note file for me.");
  await page.keyboard.press("Enter");
  const card = page.locator("div", { hasText: "write_file" }).filter({ has: page.getByRole("button", { name: "Approve" }) }).first();
  await expect(card).toBeVisible({ timeout: 60_000 });
  await card.getByRole("button", { name: "Approve" }).click();
  // setelah resolve tombol hilang → kartu tak cocok lagi filter Approve;
  // assert teks resolusi pada kartu TANPA filter tombol.
  await expect(
    page.locator("div", { hasText: "write_file" }).filter({ hasText: "approved" }).first(),
  ).toBeVisible({ timeout: 30_000 });

  // ── G5: resume — reload halaman (drop remote) → device tersimpan di
  // localStorage → auto connect → snapshot sesi memuat jawaban sebelumnya ─
  await page.reload();
  await expect(page.getByText(/joined/i).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/streams over the encrypted relay/)).toBeVisible({ timeout: 60_000 });

  // ── G6: remote kedua (context terpisah) join sesi yang sama ──────────
  const ctx2 = await context.browser()!.newContext();
  const page2 = await ctx2.newPage();
  await openRemote(page2, "tok_remote2_e2e_0000000001", "Remote 2");
  await expect(page2.getByText(/joined/i).first()).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => {
      const st = await (await request.get(`${API}/api/portal/status`)).json();
      return (st.remotes as unknown[]).length;
    }, { timeout: 20_000 })
    .toBe(2);
  await ctx2.close();
});
