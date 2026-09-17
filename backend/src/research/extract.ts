import { load } from "cheerio";
import { normalizeHref } from "./urls";

export interface ExtractedLink {
  href: string;
  url: URL;
  anchor: string;
}

export interface ExtractedPage {
  title: string;
  text: string;
  links: ExtractedLink[];
}

export function extractPage(html: string, base: URL): ExtractedPage {
  const $ = load(html ?? "");
  $("script,style,noscript,svg,iframe,canvas").remove();

  const title =
    $("title").first().text().trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("h1").first().text().trim() ||
    "";

  const text = ($("body").text() || $.root().text() || "").replace(/\s+/g, " ").trim();

  const seen = new Set<string>();
  const links: ExtractedLink[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const url = normalizeHref(href, base);
    if (!url) return;
    const key = url.href;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ href, url, anchor: $(el).text().replace(/\s+/g, " ").trim() });
  });

  return { title, text, links };
}
