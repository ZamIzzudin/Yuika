// Pass 4: mechanical strip of remaining dev tag tokens (slice/batch/plan IDs)
// from comments and test names. Indonesian prose is kept as-is; only the
// internal bookkeeping tokens go.
import fs from "node:fs";
import { execSync } from "node:child_process";

const files = execSync(
  'grep -rlE "(D[0-9]{1,2}[a-z]?|CP-[0-9]|PORT-[0-9]|PRT[0-9]|P[012]-[A-Z]{2,6}-[0-9]|Batch 1?[0-9]|PLAN §|TASKS\\.md|W5-C[0-9]|VLT-[0-9]|STU-[0-9]|DS-[0-9])" apps packages scripts e2e --include=*.ts --include=*.tsx --include=*.mjs --include=*.mts',
  { shell: true },
).toString().trim().split(/\r?\n/).filter((f) => !f.includes("node_modules"));

const TAG = new RegExp(
  String.raw`\s*\(?[^()/(]{0,24}?\b(P[012]-[A-Z]{2,6}-\d+(?:\.\d+)?(?:/[0-9]+){0,2}|CP-\d+|PORT-\d+|PRT\d+|D\d{1,2}[a-z]?|W5-C\d|VLT-\d|STU-\d|DS-\d|Batch 1?\d|PLAN §[\d.]+(?:/[0-9]+)*|TASKS\.md(?: §[\w\d.]+)?)\b[^()/(]{0,24}?\)?`,
  "g",
);

let touched = 0;
for (const f of files) {
  const txt = fs.readFileSync(f, "utf8");
  const eol = txt.includes("\r\n") ? "\r\n" : "\n";
  let changed = 0;
  const lines = txt.split(/\r?\n/).map((line) => {
    if (!/(P[012]-[A-Z]{2,6}-\d|CP-\d|PORT-\d|PRT\d|D\d{1,2}[a-z]?|W5-C\d|VLT-\d|STU-\d|DS-\d|Batch 1?\d|PLAN §|TASKS\.md)/.test(line)) return line;
    let out = line
      // full parenthetical wrappers whose content is only tags + connectors
      .replace(/\((?:[^()]*?(?:P[012]-[A-Z]{2,6}-\d|CP-\d|PORT-\d|PRT\d|D\d{1,2}[a-z]?|Batch 1?\d|PLAN §|TASKS\.md)[^()]*?)\)/g, (m) => (/^[\s(]*(?:P[012]-|CP-|PORT-|PRT\d|D\d|Batch \d|PLAN §|TASKS\.md|§|\d|[.,;:+/\- ]|W5-C\d|VLT-\d|STU-\d|DS-\d|fix user|lapor user|user report|legacy|preview|menyusul)+$/.test(m) ? "" : m))
      // bare tokens (with an optional leading/trailing label inside limits)
      .replace(TAG, " ");
    // tidy leftovers
    for (let i = 0; i < 3; i++) {
      out = out
        .replace(/\(\s*\)/g, "")
        .replace(/\(\s*,\s*\)/g, "")
        .replace(/ [,;]\s*$/, "")
        .replace(/:\s*$/, (m, off, s) => (/[\w"`*\/]\s*$/.test(s.slice(Math.max(0, off - 2), off)) ? m : m))
        .replace(/(["'`])\s*[:;,]\s+/g, "$1")
        .replace(/  +/g, " ")
        .replace(/(\*\/)\s+$/, "$1")
        .replace(/\s+$/, "");
    }
    if (out !== line) changed++;
    return out;
  });
  if (changed > 0) {
    fs.writeFileSync(f, lines.join(eol));
    touched += changed;
  }
}
console.log("files:", files.length, "lines changed:", touched);
