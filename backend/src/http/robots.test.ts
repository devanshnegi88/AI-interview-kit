import { describe, expect, it } from "vitest";
import { isPathAllowed, parseRobotsTxt } from "./robots";

describe("robots.txt foundation", () => {
  const body = `
User-agent: *
Disallow: /secret
Allow: /secret/public

User-agent: AI-Interview-Prep-Kit
Disallow: /private
`.trim();

  it("parses groups and honors longest prefix", () => {
    const groups = parseRobotsTxt(body);
    expect(isPathAllowed(groups, "Mozilla", "/secret")).toBe(false);
    expect(isPathAllowed(groups, "Mozilla", "/secret/public")).toBe(true);
    expect(isPathAllowed(groups, "Mozilla", "/about")).toBe(true);
    expect(isPathAllowed(groups, "AI-Interview-Prep-Kit/0.1", "/private")).toBe(false);
    expect(isPathAllowed(groups, "AI-Interview-Prep-Kit/0.1", "/about")).toBe(true);
  });
});
