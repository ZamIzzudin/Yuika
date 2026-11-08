// E2E auth gate (portal-only, CP-3+): mode terbuka + kontrak register/login
// lokal DIHAPUS (404). Alur sign-in via portal diuji di sso.spec.ts.
// D37: sign in/out pindah ke Settings → Account (pill sidebar dihapus).
import { expect, test } from "@playwright/test";

const API = "http://127.0.0.1:3291";

test("auth: mode terbuka tanpa user → app langsung pakai; endpoint lokal 404", async ({ page, request }) => {
  test.setTimeout(90_000);

  // 1) Mode terbuka (belum ada user): app terbuka tanpa login, orbit persona,
  //    TANPA gerbang/form. Tombol portal hidup di Settings → Account.
  await page.goto("/");
  await expect(page.getByRole("button", { name: "New project" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Sign in to Yuika")).toBeHidden();
  await page.getByRole("button", { name: "Settings" }).click();
  const dlg = page.getByRole("dialog", { name: "Settings" });
  await expect(dlg).toBeVisible();
  await dlg.getByRole("button", { name: "Account" }).click();
  await expect(
    dlg.getByRole("button", { name: "Sign in with Yuika Portal" }),
  ).toBeVisible({ timeout: 15_000 });

  // 2) /api/auth/me tanpa token → {user null, authRequired false, portalUrl).
  const me = await request.get(`${API}/api/auth/me`);
  expect((await me.json()) as object).toMatchObject({ user: null, authRequired: false });

  // 3) Konsep local account dihapus: register & login → 404.
  const reg = await request.post(`${API}/api/auth/register`, {
    data: { email: "gone@yuika.test", password: "gone-pass-123" },
  });
  expect(reg.status()).toBe(404);
  const login = await request.post(`${API}/api/auth/login`, {
    data: { email: "gone@yuika.test", password: "gone-pass-123" },
  });
  expect(login.status()).toBe(404);
});
