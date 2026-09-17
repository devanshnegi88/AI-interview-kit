import { describe, expect, it } from "vitest";
import { HttpClientError } from "../http";
import { createCompanyCrawler } from "./crawl";
import { extractPage } from "./extract";
import { canonicalize, normalizeHref, sameDomain } from "./urls";

const ORIGIN = "https://acme.example";

function page(html: string, extra: { url?: string; finalUrl?: string; status?: number } = {}) {
  return {
    url: extra.url ?? `${ORIGIN}/`,
    finalUrl: extra.finalUrl ?? extra.url ?? `${ORIGIN}/`,
    status: extra.status ?? 200,
    contentType: "text/html",
    body: html,
    ip: "93.184.216.34",
  };
}

describe("URL normalize / same-domain", () => {
  it("resolves relative URLs and drops duplicates/hashes", () => {
    const base = new URL(`${ORIGIN}/team`);
    const rel = normalizeHref("../join-us", base);
    expect(rel?.pathname).toBe("/join-us");
    const hash = normalizeHref("#top", base);
    expect(hash).toBeNull();
    expect(canonicalize(new URL(`${ORIGIN}/Team/`))).toBe(canonicalize(new URL(`${ORIGIN}/Team`)));
  });

  it("treats www as same domain and rejects external hosts", () => {
    expect(sameDomain(new URL(ORIGIN), new URL("https://www.acme.example/x"))).toBe(true);
    expect(sameDomain(new URL(ORIGIN), new URL("https://other.example/"))).toBe(false);
  });
});

describe("extractPage", () => {
  it("strips scripts and de-dupes links", () => {
    const html = `
      <html><head><title>Acme</title></head>
      <body>
        <script>alert(1)</script>
        <a href="/a">A</a>
        <a href="/a">A again</a>
        <a href="https://other.example/out">Out</a>
      </body></html>`;
    const extracted = extractPage(html, new URL(ORIGIN));
    expect(extracted.title).toBe("Acme");
    expect(extracted.text).not.toContain("alert");
    expect(extracted.links.filter((l) => l.url.pathname === "/a")).toHaveLength(1);
  });
});

describe("createCompanyCrawler", () => {
  it("crawls a normal site and ranks hiring-like pages without requiring /careers", async () => {
    const html: Record<string, string> = {
      [`${ORIGIN}/`]: `<html><head><title>Acme</title></head><body>
        Welcome. <a href="/people">Our people</a> <a href="/join-us">Join us</a>
        <a href="https://twitter.com/acme">Twitter</a></body></html>`,
      [`${ORIGIN}/people`]: `<html><head><title>Our people</title></head><body>Culture and values.</body></html>`,
      [`${ORIGIN}/join-us`]: `<html><head><title>Join us</title></head><body>We are hiring engineers. Open roles.</body></html>`,
    };
    const { crawl } = createCompanyCrawler({
      maxPages: 10,
      maxDepth: 2,
      fetchPage: async (url) => {
        const key = canonicalize(new URL(url));
        const body = html[key];
        if (!body) throw new HttpClientError("HTTP_STATUS", "missing", { status: 404, url });
        return page(body, { url: key, finalUrl: key });
      },
    });
    const result = await crawl(`${ORIGIN}/`);
    expect(result.pages.length).toBeGreaterThanOrEqual(2);
    expect(result.pages.some((p) => p.finalUrl.includes("join-us"))).toBe(true);
    expect(result.discovered.hiring.length + result.discovered.careers.length).toBeGreaterThan(0);
    expect(result.pages.every((p) => !p.finalUrl.includes("twitter"))).toBe(true);
  });

  it("still succeeds when there is no hiring page", async () => {
    const { crawl } = createCompanyCrawler({
      fetchPage: async (url) =>
        page(`<html><head><title>Acme</title></head><body>About our product platform. <a href="/story">Story</a></body></html>`, {
          url,
          finalUrl: url,
        }),
    });
    const result = await crawl(`${ORIGIN}/`);
    expect(result.pages.length).toBeGreaterThan(0);
    expect(result.discovered.hiring).toEqual([]);
  });

  it("skips a broken page and continues", async () => {
    const { crawl } = createCompanyCrawler({
      fetchPage: async (url) => {
        if (url.includes("/broken")) {
          throw new HttpClientError("HTTP_STATUS", "500", { status: 500, url, retryable: true });
        }
        return page(
          `<html><head><title>Home</title></head><body><a href="/broken">Broken</a><a href="/ok">OK</a></body></html>`,
          { url, finalUrl: url },
        );
      },
    });
    const result = await crawl(`${ORIGIN}/`);
    expect(result.skipped.some((s) => s.url.includes("/broken"))).toBe(true);
    expect(result.pages.some((p) => p.finalUrl.includes("/ok") || p.title === "Home")).toBe(true);
  });

  it("does not enqueue duplicate links twice", async () => {
    const seen: string[] = [];
    const { crawl } = createCompanyCrawler({
      fetchPage: async (url) => {
        seen.push(url);
        return page(
          `<html><head><title>Home</title></head><body>
            <a href="/team">T</a><a href="/team/">T2</a><a href="${ORIGIN}/team">T3</a>
          </body></html>`,
          { url, finalUrl: canonicalize(new URL(url)) },
        );
      },
    });
    await crawl(`${ORIGIN}/`);
    const teams = seen.filter((u) => canonicalize(new URL(u)).endsWith("/team"));
    expect(teams.length).toBe(1);
  });

  it("ignores external links", async () => {
    const seen: string[] = [];
    const { crawl } = createCompanyCrawler({
      fetchPage: async (url) => {
        seen.push(url);
        return page(
          `<html><body><a href="https://other.example/jobs">Jobs elsewhere</a></body></html>`,
          { url, finalUrl: url },
        );
      },
    });
    const result = await crawl(`${ORIGIN}/`);
    expect(seen.some((u) => u.includes("other.example"))).toBe(false);
    expect(result.pages.every((p) => p.finalUrl.startsWith(ORIGIN))).toBe(true);
  });

  it("skips robots.txt disallowed paths", async () => {
    const { crawl } = createCompanyCrawler({
      fetchPage: async (url) => {
        if (url.includes("/secret")) {
          throw new HttpClientError("ROBOTS_DISALLOWED", "disallow", { url });
        }
        return page(`<html><head><title>Home</title></head><body><a href="/secret">Secret</a></body></html>`, {
          url,
          finalUrl: url,
        });
      },
    });
    const result = await crawl(`${ORIGIN}/`);
    expect(result.skipped.some((s) => s.code === "ROBOTS_DISALLOWED")).toBe(true);
    expect(result.pages.some((p) => p.finalUrl.includes("/secret"))).toBe(false);
  });

  it("follows relative URLs from the homepage", async () => {
    const { crawl } = createCompanyCrawler({
      fetchPage: async (url) => {
        if (canonicalize(new URL(url)).endsWith("/nested")) {
          return page(`<html><head><title>Nested</title></head><body>About the company.</body></html>`, {
            url,
            finalUrl: `${ORIGIN}/nested`,
          });
        }
        return page(`<html><head><title>Home</title></head><body><a href="nested">Nested</a></body></html>`, {
          url,
          finalUrl: `${ORIGIN}/`,
        });
      },
    });
    const result = await crawl(`${ORIGIN}/`);
    expect(result.pages.some((p) => p.title === "Nested")).toBe(true);
  });

  it("records redirect finalUrl", async () => {
    const { crawl } = createCompanyCrawler({
      fetchPage: async (url) =>
        page(`<html><head><title>Moved about</title></head><body>Our story.</body></html>`, {
          url,
          finalUrl: `${ORIGIN}/company-story`,
        }),
    });
    const result = await crawl(`${ORIGIN}/old-about`);
    expect(result.pages[0]?.finalUrl).toBe(`${ORIGIN}/company-story`);
  });

  it("keeps an empty page instead of aborting research", async () => {
    const { crawl } = createCompanyCrawler({
      fetchPage: async (url) => page("<html></html>", { url, finalUrl: url }),
    });
    const result = await crawl(`${ORIGIN}/`);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.text).toBe("");
    expect(result.skipped).toEqual([]);
  });

  it("does not fail the whole run if the homepage cannot be fetched", async () => {
    const { crawl } = createCompanyCrawler({
      fetchPage: async (url) => {
        throw new HttpClientError("NETWORK", "down", { retryable: true, url });
      },
    });
    const result = await crawl(`${ORIGIN}/`);
    expect(result.pages).toEqual([]);
    expect(result.skipped[0]?.code).toBe("NETWORK");
  });
});
