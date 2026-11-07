// Batch 7 (RS) — Research Engine public surface.
export type { SearchResult, FetchedPage, SearchProvider, ResearchErrorKind } from "./types.js";
export { ResearchError } from "./types.js";
export { newResearchCache, SqliteResearchCache, type ResearchCache, type CacheKind } from "./cache.js";
export { ResearchBudget, type BudgetKind, type BudgetCheck } from "./budget.js";
export { researchSearch, DEFAULT_PROVIDERS, SEARCH_TTL_MS, type SearchOutcome, type SearchOpts } from "./search.js";
export { researchFetch, researchPolicyFor, PAGE_TTL_MS, type FetchOutcome, type FetchOpts } from "./fetcher.js";
export { researchConfig, getResearchBudget, type ResearchConfig } from "./config.js";
export { isAllowedByRobots, parseRobots, robotsAllows, robotsPatternMatch, clearRobotsCache } from "./robots.js";
export { domainThrottle } from "./util.js";
export { parseDdgLite, parseDdgHtml } from "./providers/ddg.js";
export { parseNewsRss } from "./providers/news.js";
export { pickDocsDomain } from "./providers/docsites.js";
