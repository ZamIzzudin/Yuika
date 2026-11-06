// CP-3 SSO via portal — e2e browser penuh (double portal :3110):
// gate login → tombol "Sign in with Yuika Portal" → redirect /authorize
// (double auto-accept) → balik /auth/callback?code&state → sesi Yuika →
// workspace terbuka + badge email portal. afterAll wipe users → spec
// lain tetap mode lokal (pola auth.spec.ts).
import { expect, test, type APIRequestContext } from "@playwright/test";

const API = "http://127.0.0.1:3291";

test("SSO — tombol portal → authorize (auto-accept) → callback → login", async ({ page, request }) => {
  test.setTimeout(90_000);

  // butuh gate aktif → daftarkan user lokal pertama (setupOpen/register).
  const reg = await request.post(`${API}/api/auth/register`, {
    data: { email: "sso-e2e@yuika.test", password: "sso-e2e-pass-123" },
  });
  expect(reg.ok()).toBeTruthy();

  // 1) Gerbang login menampilkan jalur utama portal.
  await page.goto("/");
  const gate = page.getByRole("form", { name: "Sign in to Yuika" });
  await expect(gate).toBeVisible({ timeout: 30_000 });
  const portalBtn = gate.getByRole("button", { name: "Sign in with Yuika Portal" });
  await expect(portalBtn).toBeVisible();

  // 2) Klik → double portal /authorize (auto-accept) → 302 balik callback.
  await portalBtn.click();
  // Callback menyelesaikan exchange (PKCE) lalu kembali ke workspace.
  await expect(page.getByRole("button", { name: "New project" })).toBeVisible({ timeout: 30_000 });

  // 3) Sesi Yuika aktif: badge email portal (dari /api/auth/me).
  await expect(page.getByTitle("Sign out")).toContainText("e2e-portal@yuika.test", { timeout: 15_000 });

  // 4) Token Yuika valid untuk route ber-auth: /api/auth/me.
  const me = await page.evaluate(async () => {
    const token = localStorage.getItem("yuika.auth.token");
    const base = "http://127.0.0.1:3291";
    const r = await fetch(`${base}/api/auth/me`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    return r.json();
  });
  expect((me as { user: { email: string } }).user.email).toBe("e2e-portal@yuika.test");
});

test.afterAll(async ({ request }: { request: APIRequestContext }) => {
  // kembali ke mode lokal (users kosong) — spec berikutnya tak terganggu.
  const mod = (await import("better-sqlite3")) as unknown as {
    default: typeof import("better-sqlite3").default;
  };
  const fs = await import("node:fs");
  const file = "e2e/.tmp/auth.db";
  if (!fs.existsSync(file)) return;
  const db = new mod.default(file);
  db.exec("DELETE FROM auth_sessions; DELETE FROM users;");
  db.close();
});
