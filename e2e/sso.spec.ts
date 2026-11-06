// CP-3 SSO via portal — e2e browser penuh (double portal :3110):
// mode terbuka → pill "Sign in" → portal /authorize (auto-accept) → balik
// /auth/callback?code&state → sesi Yuika → badge email → sign out → gerbang
// portal-only. afterAll wipe users → spec lain tetap mode terbuka.
import { expect, test, type APIRequestContext } from "@playwright/test";

const API = "http://127.0.0.1:3291";

test("SSO — pill sign-in → authorize (auto-accept) → callback → login → sign out → gerbang portal-only", async ({ page }) => {
  test.setTimeout(90_000);

  // 1) Mode terbuka: app terpakai tanpa login; pill portal ada.
  await page.goto("/");
  await expect(page.getByRole("button", { name: "New project" })).toBeVisible({ timeout: 30_000 });
  const pill = page.getByRole("button", { name: "Sign in", exact: true });
  await expect(pill).toBeVisible();

  // 2) Klik → double portal /authorize (auto-accept) → 302 balik callback.
  await pill.click();
  // Callback menyelesaikan exchange (PKCE) lalu kembali ke workspace.
  await expect(page.getByRole("button", { name: "New project" })).toBeVisible({ timeout: 30_000 });

  // 3) Sesi Yuika aktif: badge email portal (dari /api/auth/me).
  await expect(page.getByTitle("Sign out")).toContainText("e2e-portal@yuika.test", { timeout: 15_000 });

  // 4) Token Yuika valid untuk route ber-auth: /api/auth/me.
  const me = await page.evaluate(async () => {
    const token = localStorage.getItem("yuika.auth.token");
    const r = await fetch("http://127.0.0.1:3291/api/auth/me", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    return r.json();
  });
  expect((me as { user: { email: string } }).user.email).toBe("e2e-portal@yuika.test");

  // 5) Sign out → kini ada user terdaftar → gerbang portal-only (tanpa form
  //    email/password; hanya tombol portal + hint akun di portal).
  await page.getByTitle("Sign out").click();
  const gate = page.getByLabel("Sign in to Yuika");
  await expect(gate).toBeVisible({ timeout: 15_000 });
  await expect(gate.getByRole("button", { name: "Sign in with Yuika Portal" })).toBeVisible();
  await expect(gate.getByText("Accounts live in your Yuika Portal")).toBeVisible();
  await expect(gate.getByPlaceholder("you@example.com")).toHaveCount(0);
});

test.afterAll(async ({ request }: { request: APIRequestContext }) => {
  // kembali ke mode terbuka (users kosong) — spec berikutnya tak terganggu.
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
