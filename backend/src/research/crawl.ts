import {
  createSecureHttpClient,
  isHttpClientError,
  type LookupFn,
  type RequestFn,
  type SecureHttpResponse,
} from "../http";
import { extractPage } from "./extract";
import { scoreSignals, type Topic } from "./score";
import type { CompanyResearch, PageRecord, SkippedSource } from "./types";
import { canonicalize, sameDomain } from "./urls";

export type FetchPage = (url: string) => Promise<SecureHttpResponse>;

export interface CrawlerOptions {
  maxPages?: number;
  maxDepth?: number;
  fetchPage?: FetchPage;
  lookup?: LookupFn;
  request?: RequestFn;
  sleep?: (ms: number) => Promise<void>;
  minIntervalMs?: number;
  now?: () => string;
}

interface FrontierItem {
  url: string;
  depth: number;
  score: number;
  anchor: string;
}

function skipFromUnknown(url: string, err: unknown): SkippedSource {
  if (isHttpClientError(err)) {
    return { url, reason: err.message, code: err.code };
  }
  return { url, reason: err instanceof Error ? err.message : "unknown error" };
}

function emptyDiscovered(): Record<Topic, string[]> {
  return { hiring: [], careers: [], interview: [], about: [], product: [] };
}

export function createCompanyCrawler(options: CrawlerOptions = {}) {
  const maxPages = options.maxPages ?? 12;
  const maxDepth = options.maxDepth ?? 2;
  const stamp = options.now ?? (() => new Date().toISOString());

  const http =
    options.fetchPage == null
      ? createSecureHttpClient({
          respectRobots: true,
          minIntervalMs: options.minIntervalMs,
          lookup: options.lookup,
          request: options.request,
          sleep: options.sleep,
        })
      : null;
  const fetchPage: FetchPage = options.fetchPage ?? ((url) => http!.get(url, { respectRobots: true }));

  async function crawl(startUrl: string): Promise<CompanyResearch> {
    const skipped: SkippedSource[] = [];
    const pages: PageRecord[] = [];
    const visited = new Set<string>();
    const frontier: FrontierItem[] = [{ url: startUrl, depth: 0, score: 1, anchor: "" }];

    let origin: URL;
    try {
      origin = new URL(startUrl);
    } catch {
      return {
        startUrl,
        pages: [],
        skipped: [{ url: startUrl, reason: "Invalid start URL", code: "INVALID_URL" }],
        discovered: emptyDiscovered(),
      };
    }

    while (frontier.length > 0 && pages.length < maxPages) {
      frontier.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
      const next = frontier.shift();
      if (!next) break;

      let parsed: URL;
      try {
        parsed = new URL(next.url);
      } catch {
        skipped.push({ url: next.url, reason: "Invalid URL", code: "INVALID_URL" });
        continue;
      }

      if (!sameDomain(origin, parsed)) continue;
      const key = canonicalize(parsed);
      if (visited.has(key)) continue;
      visited.add(key);

      let fetched: SecureHttpResponse;
      try {
        fetched = await fetchPage(next.url);
      } catch (err) {
        skipped.push(skipFromUnknown(next.url, err));
        continue;
      }

      const base = new URL(fetched.finalUrl || fetched.url);
      const extracted = extractPage(fetched.body, base);
      const ranked = scoreSignals({
        url: base.href,
        title: extracted.title,
        text: extracted.text,
        anchor: next.anchor,
      });

      pages.push({
        url: fetched.url,
        finalUrl: fetched.finalUrl,
        title: extracted.title,
        text: extracted.text,
        score: ranked.score + (next.depth === 0 ? 1 : 0),
        topics: ranked.topics,
        status: fetched.status,
        depth: next.depth,
        fetchedAt: stamp(),
      });

      if (next.depth >= maxDepth) continue;

      for (const link of extracted.links) {
        if (!sameDomain(origin, link.url)) continue;
        const childKey = canonicalize(link.url);
        if (visited.has(childKey)) continue;
        if (frontier.some((f) => canonicalize(new URL(f.url)) === childKey)) continue;
        const childScore = scoreSignals({
          url: link.url.href,
          anchor: link.anchor,
          title: extracted.title,
        });
        frontier.push({
          url: link.url.href,
          depth: next.depth + 1,
          score: childScore.score,
          anchor: link.anchor,
        });
      }
    }

    const discovered = emptyDiscovered();
    for (const page of pages) {
      for (const topic of page.topics) {
        if (!discovered[topic].includes(page.finalUrl)) discovered[topic].push(page.finalUrl);
      }
    }

    return { startUrl, pages, skipped, discovered };
  }

  return { crawl };
}
