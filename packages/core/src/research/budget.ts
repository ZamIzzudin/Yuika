// Batch 7 (RS-1) — budget riset per sesi (sliding window 1 jam): gratisan =
// rate-limit nyata; budget menjaga agent tetap sopan & jujur saat habis.
export type BudgetKind = "query" | "page";

export interface BudgetCheck {
  ok: boolean;
  remaining: number;
  limit: number;
}

export class ResearchBudget {
  private use = new Map<string, { query: number[]; page: number[] }>();

  constructor(
    readonly maxQueries = 10,
    readonly maxPages = 20,
    readonly windowMs = 3600_000,
  ) {}

  consume(key: string, kind: BudgetKind, now = Date.now()): BudgetCheck {
    const rec = this.use.get(key) ?? { query: [], page: [] };
    const limit = kind === "query" ? this.maxQueries : this.maxPages;
    const arr = rec[kind].filter((t) => now - t < this.windowMs);
    if (arr.length >= limit) {
      rec[kind] = arr;
      this.use.set(key, rec);
      return { ok: false, remaining: 0, limit };
    }
    arr.push(now);
    rec[kind] = arr;
    this.use.set(key, rec);
    return { ok: true, remaining: limit - arr.length, limit };
  }
}
