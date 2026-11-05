// @yuika/core — admission control (P1-CRED-2) + rate limit (P1-CRED-3).
// Gas-station pattern: sebelum turn → cek saldo (cache, TTL 10 dtk, di-invalidate
// tiap usage event) + HOLD perkiraan kasar; saat turn selesai → SETTLE (hold
// dilepas; biaya actual sudah tercatat di ledger oleh hook recordUsage).
// HOLD = rata-rata biaya/panggilan 24 jam terakhir × 4 langkah/turn (clamp
// 0.02–2.0) — HANYA untuk pre-auth, tidak pernah masuk angka pelaporan.
import fs from "node:fs";
import path from "node:path";
import { BudgetConfig, type BudgetStatus, type UpdateBudgetRequest, type UsageFilter, type UsageMatrixRow } from "@yuika/contracts";
import { costOf, loadPriceBook } from "./model-prices.js";
import type { UsageLedger } from "./usage/ledger.js";

export function loadBudgetConfig(file: string): BudgetConfig {
  try {
    return BudgetConfig.parse(JSON.parse(fs.readFileSync(file, "utf-8")));
  } catch {
    return BudgetConfig.parse({}); // belum ada / rusak → default tanpa batas
  }
}

export function saveBudgetConfig(file: string, cfg: BudgetConfig): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2), "utf-8");
}

interface SpentSnapshot {
  today: number;
  total: number;
  burnPerHour: number;
  coverage: "full" | "partial" | "none";
  currency: "USD" | "IDR" | null;
}

const CACHE_TTL_MS = 10_000;
const HOLD_DEFAULT_USD = 0.05;
const HOLD_MAX = 2;

export class AdmissionControl {
  private cfg: BudgetConfig;
  private readonly turnTimes: number[] = []; // sliding window rate-limit
  private readonly holds = new Map<string, number>(); // sessionId → hold
  private cache: { at: number; snap: SpentSnapshot } | null = null;

  constructor(
    private readonly ledger: UsageLedger,
    private readonly priceBookFile: string,
    private readonly budgetFile: string,
  ) {
    this.cfg = loadBudgetConfig(budgetFile);
  }

  getConfig(): BudgetConfig {
    return this.cfg;
  }

  updateConfig(input: UpdateBudgetRequest): BudgetConfig {
    const merged = BudgetConfig.parse({ ...this.cfg, ...input, updatedAt: Date.now() });
    this.cfg = merged;
    saveBudgetConfig(this.budgetFile, merged);
    this.cache = null; // limit berubah → hitung ulang limit-hit
    return merged;
  }

  /** CRED-3: cap delegasi paralel (null → default 3). */
  maxChildren(): number {
    return this.cfg.maxDelegationConcurrency ?? 3;
  }

  /** Belanja jujur dari ledger × price book (cache TTL — "saldo cache" CRED-2). */
  private spent(force = false): SpentSnapshot {
    if (!force && this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) return this.cache.snap;
    const book = loadPriceBook(this.priceBookFile);
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const costSince = (since?: number): { usd: number; perCur: Record<string, number>; unpricedCalls: number } => {
      const s = this.ledger.summary({ ...(since !== undefined ? { since } : {}) });
      let usd = 0; const perCur: Record<string, number> = {}; let unpricedCalls = 0;
      for (const m of s.byModel) {
        const price = book[m.key];
        const c = costOf(m.promptTokens, m.outputTokens, price);
        if (c === null) { unpricedCalls += m.calls; continue; }
        usd += c;
        perCur[price!.currency] = (perCur[price!.currency] ?? 0) + c;
      }
      return { usd, perCur, unpricedCalls };
    };
    const today = costSince(dayStart.getTime());
    const total = costSince();
    const day24 = costSince(Date.now() - 24 * 3_600_000);
    const coverage: SpentSnapshot["coverage"] =
      total.unpricedCalls === 0 && total.usd === 0 ? "none" : total.unpricedCalls === 0 ? "full" : "partial";
    const currency = (Object.entries(total.perCur).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null) as "USD" | "IDR" | null;
    const snap: SpentSnapshot = {
      today: today.usd,
      total: total.usd,
      burnPerHour: day24.usd / 24,
      coverage,
      currency,
    };
    this.cache = { at: Date.now(), snap };
    return snap;
  }

  /** Perkiraan kasar HOLD (pre-auth): rata-rata biaya/panggilan 24 j × 4 langkah. */
  holdEstimate(): number {
    const avg = this.spent().burnPerHour; // fallback kasar bila sepi
    const book = loadPriceBook(this.priceBookFile);
    const s = this.ledger.summary({ since: Date.now() - 24 * 3_600_000 });
    const calls = s.calls || 0;
    if (calls > 0) {
      let usd = 0;
      for (const m of s.byModel) usd += costOf(m.promptTokens, m.outputTokens, book[m.key]) ?? 0;
      return Math.min(Math.max((usd / calls) * 4, 0.02), HOLD_MAX);
    }
    return Math.min(Math.max(avg, HOLD_DEFAULT_USD), HOLD_MAX) || HOLD_DEFAULT_USD;
  }

  /** Pre-auth satu turn: rate limit → budget (hold dihitung masuk). */
  admitTurn(sessionId: string): { ok: boolean; reason: string | null; warn: string | null; status: BudgetStatus } {
    const now = Date.now();
    while (this.turnTimes.length && now - this.turnTimes[0]! > 60_000) this.turnTimes.shift();
    const status = this.status();
    if (this.cfg.maxTurnsPerMinute !== null && this.turnTimes.length >= this.cfg.maxTurnsPerMinute) {
      return { ok: false, reason: `Rate limit workspace tercapai (${this.cfg.maxTurnsPerMinute} turn/menit) — tunggu sebentar`, warn: null, status };
    }
    const hold = this.holdEstimate();
    const cur = status.currency ?? "USD";
    const overDaily = status.dailyLimitHit || (this.cfg.dailyLimit !== null && status.spentToday + hold >= this.cfg.dailyLimit);
    const overTotal = status.totalLimitHit || (this.cfg.totalLimit !== null && status.spentTotal + hold >= this.cfg.totalLimit);
    if (overDaily || overTotal) {
      const which = overDaily ? `harian ${this.cfg.dailyLimit} ${cur}` : `total ${this.cfg.totalLimit} ${cur}`;
      if (this.cfg.mode === "block") {
        return { ok: false, reason: `Budget ${which} tercapai — turn DITOLAK (mode block). Naikkan limit di Settings → Metering`, warn: null, status };
      }
      this.turnTimes.push(now);
      this.holds.set(sessionId, hold);
      return { ok: true, reason: null, warn: `Budget ${which} tercapai (belanja ${overDaily ? status.spentToday : status.spentTotal} ${cur} + hold)`, status };
    }
    this.turnTimes.push(now);
    this.holds.set(sessionId, hold);
    return { ok: true, reason: null, warn: null, status };
  }

  /** Settle: turn selesai → hold dilepas (actual usage sudah di ledger). */
  settleTurn(sessionId: string): void {
    this.holds.delete(sessionId);
  }

  /** Dipanggil tiap usage event tercatat → saldo cache dihitung ulang. */
  noteUsage(): void {
    this.cache = null;
  }

  status(): BudgetStatus {
    const snap = this.spent();
    const dailyLimitHit = this.cfg.dailyLimit !== null && snap.today >= this.cfg.dailyLimit;
    const totalLimitHit = this.cfg.totalLimit !== null && snap.total >= this.cfg.totalLimit;
    return {
      config: this.cfg,
      spentToday: snap.today,
      spentTotal: snap.total,
      burnRatePerHour: snap.burnPerHour,
      activeHolds: [...this.holds.values()].reduce((a, b) => a + b, 0),
      coverage: snap.coverage,
      currency: snap.currency,
      dailyLimitHit,
      totalLimitHit,
    };
  }
}

/** CRED-4: matrix attribution persona × model + biaya dari price book. */
export function usageMatrixWithCost(ledger: UsageLedger, priceBookFile: string, filter: UsageFilter = {}): UsageMatrixRow[] {
  const book = loadPriceBook(priceBookFile);
  return ledger
    .matrix(filter)
    .map((r) => {
      const price = book[r.model];
      const cost = costOf(r.promptTokens, r.outputTokens, price);
      return { ...r, cost, currency: cost === null ? null : price!.currency };
    })
    .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));
}
