/**
 * research/ — Phase 5 dynamic company crawler.
 *
 * Discovers pages from the homepage. Paths like /careers are ranking
 * signals, not required. Retrieval goes through the Phase 4 HTTP client.
 * No LLM research in this phase.
 */

export { createCompanyCrawler } from "./crawl";
export type { CrawlerOptions, FetchPage } from "./crawl";
export { extractPage } from "./extract";
export { scoreSignals, TOPICS } from "./score";
export type { LinkScore, ScoreInput, Topic } from "./score";
export { canonicalize, normalizeHref, sameDomain } from "./urls";
export type { CompanyResearch, PageRecord, SkippedSource } from "./types";
