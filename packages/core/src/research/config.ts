// Batch 7 (RS-5), config riset dari env (kill-switch + searxng opsional + limit).
// Budget singleton per proses (tahan HMR via globalThis, pattern runtime).
import { ResearchBudget } from "./budget.js";

export interface ResearchConfig {
  /** YUI_RESEARCH_OFF=1 → web_search/web_fetch riset dimatikan total */
  off: boolean;
  /** YUI_SEARXNG_URL, kosong = hanya ddg fallback sebagai engine umum */
  searxngUrl: string;
  /** YUI_RESEARCH_DDG=0 → matikan endpoint nonofficial */
  ddgEnabled: boolean;
  maxQueries: number;
  maxPages: number;
  domainDelayMs: number;
}

const num = (v: string | undefined, d: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : d;
};

export function researchConfig(): ResearchConfig {
  return {
    off: /^(1|true|yes)$/i.test(process.env.YUI_RESEARCH_OFF ?? ""),
    searxngUrl: process.env.YUI_SEARXNG_URL?.trim() || "",
    ddgEnabled: !/^(0|false|no)$/i.test(process.env.YUI_RESEARCH_DDG ?? ""),
    maxQueries: num(process.env.YUI_RESEARCH_MAX_QUERIES, 30),
    maxPages: num(process.env.YUI_RESEARCH_MAX_PAGES, 20),
    domainDelayMs: num(process.env.YUI_RESEARCH_DOMAIN_DELAY_MS, 1000),
  };
}

const g = globalThis as typeof globalThis & { __yuiResearchBudget?: ResearchBudget };

export function getResearchBudget(): ResearchBudget {
  if (!g.__yuiResearchBudget) {
    const c = researchConfig();
    g.__yuiResearchBudget = new ResearchBudget(c.maxQueries, c.maxPages);
  }
  return g.__yuiResearchBudget;
}
