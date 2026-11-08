// CP-3 SSO via portal, e2e browser penuh (double portal :3110):
// mode terbuka → Settings → Account → "Sign in with Yuika Portal" → portal
// /authorize (auto-accept) → /auth/callback?code&state → sesi Yuika → email
// di panel Account → sign out → gerbang portal-only. afterAll wipe users →
// spec lain tetap mode terbuka. (D37: pill sidebar diganti Settings → Account.)
import { expect, test, type APIRequestContext } from "@playwright/test";

const API = "http://127.0.0.1:3291";

/** Buka Settings → Account, kembalikan dialog untuk assertion. */
async function openAccount(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Settings" }).click();
  const dlg = page.getByRole("dialog", { name: "Settings" });
  await expect(dlg).toBeVisible();
  await dlg.getByRole("button", { name: "Account" }).click();
  await expect(dlg.getByText("Your Yuika Portal session")).toBeVisible();
  return dlg;
}

test("SSO, Settings→Account sign-in → authorize (auto-accept) → callback → login → sign out → gerbang portal-only", async ({
  page,
}) => {
  test.setTimeout(90_000);

  // 1) Mode terbuka: app terpakai tanpa login; Settings → Account menawarkan
  //    sign-in portal.
  await page.goto("/");
  await expect(page.getByRole("button", { name: "New project" })).toBeVisible({
    timeout: 30_000,
  });
  const dlg = await openAccount(page);
  const signIn = dlg.getByRole("button", {
    name: "Sign in with Yuika Portal",
  });

  // 2) Klik → double portal /authorize (auto-accept) → 302 balik callback.
  await signIn.click();
  // Callback menyelesaikan exchange (PKCE) lalu kembali ke workspace.
  await expect(page.getByRole("button", { name: "New project" })).toBeVisible({
    timeout: 30_000,
  });

  // 3) Sesi Yuika aktif: email portal (dari /api/auth/me) di panel Account.
  const dlg2 = await openAccount(page);
  await expect(dlg2.getByText("e2e-portal@yuika.test")).toBeVisible({
    timeout: 15_000,
  });
  await expect(dlg2.getByTitle("Sign out")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dlg2).toBeHidden();

  // 4) Token Yuika valid untuk route ber-auth: /api/auth/me.
  const me = await page.evaluate(async () => {
    const token = localStorage.getItem("yuika.auth.token");
    const r = await fetch("http://127.0.0.1:3291/api/auth/me", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    return r.json();
  });
  expect((me as { user: { email: string } }).user.email).toBe(
    "e2e-portal@yuika.test",
  );

  // 4b) CP-4 auto-link: browser ter-claim sebagai device web di portal
  // (deviceToken ikut exchange → /api/devices/claim kind=web).
  const st = await page.evaluate(async () => {
    const token = localStorage.getItem("yuika.auth.token");
    const r = await fetch("http://127.0.0.1:3291/api/portal/status", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    return r.json();
  });
  expect((st as { webDevice: { deviceId: string } | null }).webDevice?.deviceId).toMatch(
    /^dev_[0-9a-f]{16}$/,
  );

  // 5) Sign out → kini ada user terdaftar → gerbang portal-only (tanpa form
  //    email/password; hanya tombol portal + hint akun di portal).
  const dlg3 = await openAccount(page);
  await dlg3.getByTitle("Sign out").click();
  const gate = page.getByLabel("Sign in to Yuika");
  await expect(gate).toBeVisible({ timeout: 15_000 });
  // D46: gerbang login punya playground zero-g full-screen — maskot statis
  // (mode gerbang 401 utk fetch roster) melayang & bisa dilempar.
  const gateMascots = page.locator("[data-mascot]");
  await expect(gateMascots.first()).toBeVisible({ timeout: 5_000 });
  console.log("gate mascots:", await gateMascots.count());
  await page.screenshot({ path: "e2e/.tmp/space-gate.png" });
  await expect(
    gate.getByRole("button", { name: "Sign in with Yuika Portal" }),
  ).toBeVisible();
  await expect(gate.getByText(/have an account\?/)).toBeVisible();
  // Link portal membuka tab baru ke base portal (double :3110 di e2e).
  const portalLink = gate.getByRole("link", {
    name: "Sign Up to Yuika Portal",
  });
  await expect(portalLink).toHaveAttribute("href", "http://127.0.0.1:3110");
  await expect(portalLink).toHaveAttribute("target", "_blank");
  await expect(gate.getByPlaceholder("you@example.com")).toHaveCount(0);
});

test.afterAll(async ({ request }: { request: APIRequestContext }) => {
  // kembali ke mode terbuka (users kosong), spec berikutnya tak terganggu.
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
