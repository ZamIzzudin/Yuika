// Static web build for the desktop shell. Invoked by the tauri.conf
// beforeBuildCommand (cwd = apps/desktop): menghasilkan apps/web/out
// (frontendDist shell). NEXT_EXPORT=1 → next.config output:"export".
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "apps", "web");

const r = spawnSync("npx", ["next", "build"], {
  cwd: web,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, NEXT_EXPORT: "1" },
});
if (r.status !== 0) {
  console.error("[build-desktop-web] next export build failed");
  process.exit(r.status ?? 1);
}
console.log("[build-desktop-web] static UI ready at apps/web/out");
