// P1-CRED-2/3/4: admission control (hold→settle + saldo cache), rate limit
// turn/menit, cap delegasi paralel, attribution matrix persona×model.
// Prinsip: angka belanja = ledger jujur × price book; model tanpa harga =
// coverage "partial" (batas bawah, bukan 0); HOLD hanya pre-auth, dilepas settle.
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { UsageLedger } from "../usage/ledger.js";
import { AdmissionControl, loadBudgetConfig, saveBudgetConfig, usageMatrixWithCost } from "../budget.js";
import { saveModelPrice } from "../model-prices.js";
import type { UsageEvent } from "@yui/contracts";

let dir: string;
let ledger: UsageLedger;
let priceFile: string;
let budgetFile: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "yui-budget-"));
  ledger = new UsageLedger(path.join(dir, "t.db"));
  priceFile = path.join(dir, "prices.json");
  budgetFile = path.join(dir, "budget.json");
});
afterEach(() => {
  ledger.close();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Windows lock */ }
});

const ev = (at: number, model: string, pTok: number, oTok: number): UsageEvent => ({
  sessionId: "s1", projectId: null, personaId: "yui-coder", model,
  promptTokens: pTok, outputTokens: oTok, latencyMs: 100, at,
});

describe("budget config file", () => {
  it("default tanpa file = semua tanpa batas, mode warn", () => {
    const cfg = loadBudgetConfig(budgetFile);
    expect(cfg.mode).toBe("warn");
    expect(cfg.dailyLimit).toBeNull();
    expect(cfg.totalLimit).toBeNull();
  });
  it("updateConfig menyimpan & bisa dimuat ulang", () => {
    const ac = new AdmissionControl(ledger, priceFile, budgetFile);
    ac.updateConfig({ dailyLimit: 5, maxTurnsPerMinute: 10 });
    const cfg = loadBudgetConfig(budgetFile);
    expect(cfg.dailyLimit).toBe(5);
    expect(cfg.maxTurnsPerMinute).toBe(10);
    expect(cfg.updatedAt).toBeGreaterThan(0);
  });
});

describe("admission control (hold→settle)", () => {
  it("hold tercatat saat admit, dilepas saat settle", () => {
    const ac = new AdmissionControl(ledger, priceFile, budgetFile);
    const a = ac.admitTurn("s1");
    expect(a.ok).toBe(true);
    expect(ac.status().activeHolds).toBeGreaterThan(0);
    ac.settleTurn("s1");
    expect(ac.status().activeHolds).toBe(0);
  });

  it("mode block: melewati limit harian → turn DITOLAK", () => {
    saveModelPrice(priceFile, "m-a", { inputPerMillion: 1, outputPerMillion: 2, currency: "USD" });
    // 1jt in + 1jt out = 1+2 = 3 USD hari ini
    ledger.record(ev(Date.now(), "m-a", 1_000_000, 1_000_000));
    const ac = new AdmissionControl(ledger, priceFile, budgetFile);
    ac.updateConfig({ mode: "block", dailyLimit: 2.5 }); // spent 3 ≥ 2.5 = hit; +hold tetap jauh di atas
    const a = ac.admitTurn("s2");
    expect(a.ok).toBe(false);
    expect(a.reason).toContain("harian");
    expect(ac.status().dailyLimitHit).toBe(true);
  });

  it("mode warn: turn tetap jalan + warning", () => {
    saveModelPrice(priceFile, "m-a", { inputPerMillion: 1, outputPerMillion: 2, currency: "USD" });
    ledger.record(ev(Date.now(), "m-a", 1_000_000, 1_000_000));
    const ac = new AdmissionControl(ledger, priceFile, budgetFile);
    ac.updateConfig({ mode: "warn", dailyLimit: 3.05 });
    const a = ac.admitTurn("s2");
    expect(a.ok).toBe(true);
    expect(a.warn).toContain("harian");
  });

  it("model tanpa harga → coverage partial (angka = batas bawah, bukan 0)", () => {
    saveModelPrice(priceFile, "m-a", { inputPerMillion: 1, outputPerMillion: 0, currency: "USD" });
    ledger.record(ev(Date.now(), "m-a", 1_000_000, 0)); // terhargai 1 USD
    ledger.record(ev(Date.now(), "m-b", 5_000_000, 0)); // TAK dihargai
    const ac = new AdmissionControl(ledger, priceFile, budgetFile);
    const st = ac.status();
    expect(st.coverage).toBe("partial");
    expect(st.spentToday).toBeCloseTo(1, 5);
    expect(st.currency).toBe("USD");
  });

  it("belum ada data sama sekali → coverage none, angka 0, currency null", () => {
    const ac = new AdmissionControl(ledger, priceFile, budgetFile);
    const st = ac.status();
    expect(st.coverage).toBe("none");
    expect(st.currency).toBeNull();
    expect(st.spentTotal).toBe(0);
  });

  it("saldo cache di-invalidate oleh noteUsage", () => {
    const ac = new AdmissionControl(ledger, priceFile, budgetFile);
    ac.status(); // isi cache
    saveModelPrice(priceFile, "m-a", { inputPerMillion: 1, outputPerMillion: 0, currency: "USD" });
    ledger.record(ev(Date.now(), "m-a", 2_000_000, 0));
    ac.noteUsage();
    expect(ac.status().spentToday).toBeCloseTo(2, 5);
  });
});

describe("rate limit (CRED-3)", () => {
  it("melewati turn/menit → ditolak dengan pesan rate limit", () => {
    const ac = new AdmissionControl(ledger, priceFile, budgetFile);
    ac.updateConfig({ maxTurnsPerMinute: 2 });
    expect(ac.admitTurn("s1").ok).toBe(true);
    expect(ac.admitTurn("s2").ok).toBe(true);
    const third = ac.admitTurn("s3");
    expect(third.ok).toBe(false);
    expect(third.reason).toContain("Rate limit");
  });
});

describe("attribution matrix (CRED-4)", () => {
  it("rollup persona×model + biaya dari price book; tanpa harga = null", () => {
    saveModelPrice(priceFile, "m-a", { inputPerMillion: 1, outputPerMillion: 1, currency: "USD" });
    ledger.record({ ...ev(Date.now(), "m-a", 1_000_000, 1_000_000), personaId: "yui-coder" });
    ledger.record({ ...ev(Date.now(), "m-b", 1_000_000, 1_000_000), personaId: "yui-analyst" });
    const rows = usageMatrixWithCost(ledger, priceFile);
    const a = rows.find((r) => r.model === "m-a")!;
    expect(a.personaId).toBe("yui-coder");
    expect(a.cost).toBeCloseTo(2, 5); // 1jt×1 + 1jt×1
    expect(a.currency).toBe("USD");
    const b = rows.find((r) => r.model === "m-b")!;
    expect(b.cost).toBeNull();
    expect(b.currency).toBeNull();
  });
});
