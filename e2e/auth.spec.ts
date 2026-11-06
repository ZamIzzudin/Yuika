// P1-INF-1 — E2E auth gate: mode lokal terbuka → register → login UI →
// workspace → sign out → gerbang kembali. afterAll membersihkan users agar
// spec lain (smoke/persona) tetap berjalan mode lokal (backward compat).
import { expect, test, type APIRequestContext } from "@playwright/test";


const EMAIL = "e2e-owner@yuika.test";
const PASSWORD = "e2e-strong-pass";

async function register(request: APIRequestContext, port: number): Promise<string> {
  const r = await request.post(`http://127.0.0.1:${port}/api/auth/register`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(r.ok()).toBeTruthy();
  return ((await r.json()) as { token: string }).token;
}

test("auth: local mode open → gate after register → login → sign out", async ({ page, request }) => {
  test.setTimeout(90_000);
  const API = 3291;

  // 1) Mode lokal (belum ada user): app terbuka tanpa login — orbit persona.
  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "New project" })).toBeVisible();

  // 2) Register via API (bentuk UI-nya identik form login) → reload: gerbang.
  await register(request, API);
  await page.reload();
  const gate = page.getByRole("form", { name: "Sign in to Yuika" });
  await expect(gate).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Sign in to your agent studio")).toBeVisible();

  // 3) Login salah → toast error; benar → workspace muncul + badge email.
  await gate.getByPlaceholder("you@example.com").fill(EMAIL);
  await gate.getByPlaceholder("At least 8 characters").fill("wrong-password");
  await gate.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("invalid email or password")).toBeVisible();

  await gate.getByPlaceholder("At least 8 characters").fill(PASSWORD);
  await gate.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "New project" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /^Sign out/ })).toContainText(EMAIL);

  // 4) Token disimpan → reload tetap masuk (session persist).
  await page.reload();
  await expect(page.getByRole("button", { name: "New project" })).toBeVisible({ timeout: 15_000 });

  // 5) Sign out → gerbang kembali.
  await page.getByRole("button", { name: /^Sign out/ }).click();
  await expect(page.getByRole("form", { name: "Sign in to Yuika" })).toBeVisible();
});

test.afterAll(async () => {
  // Bersihkan state user via token yang dibuat spec ini — spec berikutnya
  // kembali ke mode lokal (users kosong). DB langsung via sqlite aman (WAL).
  const mod = (await import("better-sqlite3")) as unknown as {
    default: typeof import("better-sqlite3").default;
  };
  const Database = mod.default;
  const fs = await import("node:fs");
  const file = "e2e/.tmp/auth.db";
  if (!fs.existsSync(file)) return;
  const db = new Database(file);
  db.exec("DELETE FROM auth_sessions; DELETE FROM users;");
  db.close();
});
