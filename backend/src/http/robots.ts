/**
 * robots.txt parser foundation for the later crawler.
 * Implements the common longest-prefix Allow/Disallow match.
 */

export interface RobotsGroup {
  userAgents: string[];
  allow: string[];
  disallow: string[];
  crawlDelay?: number;
}

export function parseRobotsTxt(body: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let sawDirective = false;

  const startGroup = (): RobotsGroup => {
    const g: RobotsGroup = { userAgents: [], allow: [], disallow: [] };
    groups.push(g);
    return g;
  };

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon < 1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === "user-agent") {
      if (!current || sawDirective) {
        current = startGroup();
        sawDirective = false;
      }
      current.userAgents.push(value.toLowerCase());
      continue;
    }
    if (!current) current = startGroup();
    if (field === "allow") {
      current.allow.push(value);
      sawDirective = true;
    } else if (field === "disallow") {
      current.disallow.push(value);
      sawDirective = true;
    } else if (field === "crawl-delay") {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) current.crawlDelay = n;
      sawDirective = true;
    }
  }

  return groups;
}

function matchingGroup(groups: RobotsGroup[], userAgent: string): RobotsGroup | undefined {
  const ua = userAgent.toLowerCase();
  const specific = groups.find((g) => g.userAgents.some((a) => a !== "*" && ua.includes(a)));
  if (specific) return specific;
  return groups.find((g) => g.userAgents.includes("*"));
}

function longestMatch(patterns: string[], path: string): number {
  let best = -1;
  for (const p of patterns) {
    if (p === "") continue;
    if (path.startsWith(p) && p.length > best) best = p.length;
  }
  return best;
}

export function isPathAllowed(groups: RobotsGroup[], userAgent: string, path: string): boolean {
  const group = matchingGroup(groups, userAgent);
  if (!group) return true;
  const allowLen = longestMatch(group.allow, path);
  const disallowLen = longestMatch(group.disallow, path);
  if (disallowLen < 0 && allowLen < 0) return true;
  if (allowLen === disallowLen) return allowLen >= 0;
  return allowLen > disallowLen;
}
