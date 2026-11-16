// G-ALPHA metering: laporan usage ledger + akurasi vs tagihan provider.
// Sumber = tabel usage_events (append-only, angka usage dari provider,
// tanpa estimasi). Biaya = harga price book user (model-prices.json di
// samping DB); model tanpa harga = "-" (jujur, bukan 0).
//
//   node scripts/usage-report.mjs data/app.db
//   node scripts/usage-report.mjs data/app.db --since 2026-11-01
//   node scripts/usage-report.mjs data/app.db \
//     --expect '{"gpt-x":{"in":123456,"out":7890}}'   # akurasi vs tagihan
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const dbArg = args.find((a) => !a.startsWith("--"));
if (!dbArg) {
  console.error("usage: node scripts/usage-report.mjs <db-path> [--since YYYY-MM-DD] [--expect JSON]");
  process.exit(1);
}
const sinceIdx = args.indexOf("--since");
const since = sinceIdx >= 0 ? Date.parse(args[sinceIdx + 1] + "T00:00:00Z") : null;
const expectIdx = args.indexOf("--expect");
let expect = null;
if (expectIdx >= 0) {
  try {
    expect = JSON.parse(args[expectIdx + 1]);
  } catch {
    console.error("--expect: JSON tidak valid");
    process.exit(1);
  }
}

if (!fs.existsSync(dbArg)) {
  console.error(`db tidak ditemukan: ${dbArg}`);
  process.exit(1);
}
const db = new Database(dbArg, { readonly: true });
const hasTable = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='usage_events'")
  .get();
if (!hasTable) {
  console.error("tabel usage_events tidak ada di db ini");
  process.exit(1);
}

const pricesFile = path.join(path.dirname(path.resolve(dbArg)), "model-prices.json");
const prices = fs.existsSync(pricesFile) ? JSON.parse(fs.readFileSync(pricesFile, "utf-8")) : {};

const rows = db
  .prepare(
    `SELECT model, COUNT(*) calls, SUM(prompt_tokens) p, SUM(output_tokens) o
     FROM usage_events ${since ? "WHERE at >= ?" : ""} GROUP BY model ORDER BY p + o DESC`,
  )
  .all(...(since ? [since] : []));

const fmt = (n) => (n ?? 0).toLocaleString("en-US");
console.log(`\nUsage ledger: ${path.resolve(dbArg)}${since ? ` (since ${new Date(since).toISOString().slice(0, 10)})` : ""}`);
console.log(`Price book: ${fs.existsSync(pricesFile) ? pricesFile : "(tidak ada - biaya '-')"}\n`);
console.log("Model | Calls | In | Out | Cost");
console.log("--- | --- | --- | --- | ---");
let totIn = 0, totOut = 0, totCost = 0, priced = false;
for (const r of rows) {
  totIn += r.p; totOut += r.o;
  const pr = prices[r.model];
  const cost =
    pr && (pr.inputPerMillion || pr.outputPerMillion)
      ? (r.p / 1e6) * pr.inputPerMillion + (r.o / 1e6) * pr.outputPerMillion
      : null;
  if (cost !== null) { totCost += cost; priced = true; }
  console.log(`${r.model} | ${fmt(r.calls)} | ${fmt(r.p)} | ${fmt(r.o)} | ${cost === null ? "-" : cost.toFixed(4)}`);
}
console.log(`TOTAL | | ${fmt(totIn)} | ${fmt(totOut)} | ${priced ? totCost.toFixed(4) : "-"}`);

if (expect) {
  console.log("\nAkurasi vs tagihan (gerbang <2%):");
  let pass = true;
  for (const [model, bill] of Object.entries(expect)) {
    const led = rows.find((r) => r.model === model);
    const li = led?.p ?? 0, lo = led?.o ?? 0;
    const di = bill.in != null ? (Math.abs(li - bill.in) / Math.max(bill.in, 1)) * 100 : null;
    const doo = bill.out != null ? (Math.abs(lo - bill.out) / Math.max(bill.out, 1)) * 100 : null;
    const ok = (di === null || di < 2) && (doo === null || doo < 2);
    if (!ok) pass = false;
    console.log(
      `  ${model}: in ledger ${fmt(li)} vs bill ${fmt(bill.in ?? "-")} (${di === null ? "-" : di.toFixed(2) + "%"}) | ` +
        `out ${fmt(lo)} vs ${fmt(bill.out ?? "-")} (${doo === null ? "-" : doo.toFixed(2) + "%"}) ${ok ? "PASS" : "FAIL"}`,
    );
  }
  console.log(pass ? "\nHASIL: PASS (<2%)" : "\nHASIL: FAIL (>=2%) - cek provider tanpa usage / model tak tercatat)");
  process.exit(pass ? 0 : 2);
}
