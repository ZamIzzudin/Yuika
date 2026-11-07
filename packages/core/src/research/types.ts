// Batch 7 (RS) — Research Engine: kontrak provider search & fetch.
// Brief "Remote Browser & Research Tool" §B: tanpa UI, tanpa API berbayar,
// defensif (cache + fallback + hasil parsial). Plan: docs/PLAN-RESEARCH-LIVE-BROWSER.md

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface FetchedPage {
  url: string;
  title: string;
  markdown: string;
  fetchedAt: string;
}

export interface SearchProvider {
  name: string;
  /** Heuristik murah: apakah query ini relevan untuk provider (site-router). */
  matches(query: string): boolean;
  search(query: string, opts: { limit: number; signal?: AbortSignal }): Promise<SearchResult[]>;
}

export type ResearchErrorKind =
  | "bad_url"
  | "scheme_denied"
  | "host_denied"
  | "private_blocked"
  | "robots_denied"
  | "timeout"
  | "fetch_failed"
  | "too_many_redirects"
  | "too_large"
  | "content_type_denied"
  | "budget_exceeded"
  | "disabled"
  | "readability_failed";

/** Mirip BrowserReadError (browser/reader.ts) — kode stabil utk pesan tool. */
export class ResearchError extends Error {
  constructor(
    public readonly code: ResearchErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ResearchError";
  }
}
