// PUB-1: regenerate THIRD-PARTY-NOTICES.md dari dependency produksi nyata
// (npm ls --omit=dev --parseable). Zero-dep (node builtin saja).
// Jalankan: node scripts/gen-notices.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

// 1. Semua paket prod (termasuk transitive) sebagai path node_modules.
let out = "";
try {
  out = execFileSync("npm", ["ls", "--all", "--omit=dev", "--parseable"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
    shell: true, // Windows: npm = npm.cmd
  });
} catch (e) {
  // npm ls exit != 0 kalau ada extraneous; output tetap dipakai.
  out = (e.stdout ?? "").toString();
}

const pkgs = new Map();
for (const line of out.split(/\r?\n/)) {
  const p = line.trim();
  if (!p || !p.includes("node_modules")) continue;
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(p, "package.json"), "utf8"));
  } catch {
    continue;
  }
  if (!pkg.name) continue;
  // First-party workspace packages: bukan pihak ketiga.
  if (pkg.name.startsWith("@yuika/") || pkg.name === "yuika") continue;
  const lic = Array.isArray(pkg.licenses)
    ? pkg.licenses.map((l) => l.type ?? l).join(" OR ")
    : (pkg.license ?? (pkg.licenseText ? "SEE LICENSE" : "UNKNOWN"));
  pkgs.set(pkg.name, {
    version: pkg.version ?? "?",
    license: typeof lic === "string" ? lic.replace(/\s+/g, " ").trim() : "UNKNOWN",
    homepage: pkg.homepage ?? "",
    repo:
      typeof pkg.repository === "string"
        ? pkg.repository
        : (pkg.repository?.url ?? "").replace(/^git\+/, ""),
  });
}

// 2. Render.
const names = [...pkgs.keys()].sort((a, b) => a.localeCompare(b));
const lines = [
  "# Third-party notices",
  "",
  "Runtime (production) dependencies resolved for the shipped Yuika",
  "artifacts (api server, web studio, desktop bundle). Regenerate with",
  "`node scripts/gen-notices.mjs`. Development-only tooling is not shipped",
  "and not listed. License names are as declared by each package;",
  "`SEE LICENSE` points to the packaged LICENSE file.",
  "",
  `Generated: ${new Date().toISOString().slice(0, 10)} - ${names.length} packages`,
  "",
  "| Package | Version | License |",
  "| --- | --- | --- |",
];
for (const n of names) {
  const p = pkgs.get(n);
  lines.push(`| ${n} | ${p.version} | ${p.license} |`);
}
lines.push(
  "",
  "## Special notices",
  "",
  "- `sharp` and its `@img/*` binaries embed libvips components under",
  "  LGPL-3.0-or-later. Yuika links them dynamically (npm optional",
  "  dependencies) and does not modify them; source availability for those",
  "  components is provided by the upstream sharp project.",
  "- `caniuse-lite` is data licensed CC-BY-4.0 by the caniuse project",
  "  (https://caniuse.com). Browserslist passes it through as build data.",
  "- `@mozilla/readability` (Apache-2.0) and `@mixmark-io/domino`",
  "  (BSD-2-Clause) are used by the research reader; their notices apply as",
  "  declared in the table above.",
  "",
);
fs.writeFileSync(path.join(root, "THIRD-PARTY-NOTICES.md"), lines.join("\n") + "\n");
console.log(`THIRD-PARTY-NOTICES.md: ${names.length} packages`);
