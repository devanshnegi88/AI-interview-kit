import { describe, expect, it, vi } from "vitest";
import { createLlmRuntime } from "../llm";
import { isRequirementId } from "../validation/ids";
import { ExtractedRequirementSchema, RequirementKindSchema, ExtractedPrioritySchema } from "../validation/schema";
import { extractRequirements, toKitRequirement } from "./extractRequirements";

function chatOk(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function rt(content: string | (() => string), extra: { maxRepairAttempts?: number } = {}) {
  return createLlmRuntime({
    provider: "groq",
    apiKey: "test-key",
    minIntervalMs: 0,
    maxRetries: 0,
    maxRepairAttempts: extra.maxRepairAttempts ?? 0,
    fetch: async () => chatOk(typeof content === "function" ? content() : content),
    sleep: vi.fn(async () => undefined),
    random: () => 0,
  });
}

function pack(
  items: Array<{ text: string; kind: string; priority: string }>,
): string {
  return JSON.stringify({ requirements: items });
}

describe("extractRequirements", () => {
  it("extracts a normal mixed JD", async () => {
    const result = await extractRequirements(
      "We need a backend engineer. Required: TypeScript and PostgreSQL. You will work with payments. Strong communication required. Preferred: Kubernetes.",
      rt(
        pack([
          { text: "TypeScript", kind: "technical", priority: "must" },
          { text: "PostgreSQL", kind: "technical", priority: "must" },
          { text: "Payments domain experience", kind: "domain", priority: "must" },
          { text: "Strong communication", kind: "behavioural", priority: "must" },
          { text: "Kubernetes", kind: "technical", priority: "nice" },
        ]),
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.every((r) => isRequirementId(r.id))).toBe(true);
    expect(result.data.map((r) => r.kind).sort()).toEqual([
      "behavioural",
      "domain",
      "technical",
      "technical",
      "technical",
    ]);
    expect(result.data.filter((r) => r.priority === "nice").map((r) => r.text)).toEqual(["Kubernetes"]);
    expect(toKitRequirement(result.data[0]!).priority).toMatch(/must_have|nice_to_have/);
  });

  it("extracts a technical JD", async () => {
    const result = await extractRequirements(
      "Required: Python, Django, Redis, and AWS.",
      rt(
        pack([
          { text: "Python", kind: "technical", priority: "must" },
          { text: "Django", kind: "technical", priority: "must" },
          { text: "Redis", kind: "technical", priority: "must" },
          { text: "AWS", kind: "technical", priority: "must" },
        ]),
      ),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.every((r) => r.kind === "technical")).toBe(true);
  });

  it("extracts a behavioural JD", async () => {
    const result = await extractRequirements(
      "We need someone who mentors others, communicates clearly, and takes ownership.",
      rt(
        pack([
          { text: "Mentors others", kind: "behavioural", priority: "must" },
          { text: "Communicates clearly", kind: "behavioural", priority: "must" },
          { text: "Takes ownership", kind: "behavioural", priority: "must" },
        ]),
      ),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.every((r) => r.kind === "behavioural")).toBe(true);
  });

  it("extracts a mixed JD with domain and technical items", async () => {
    const result = await extractRequirements(
      "Healthcare SaaS. Must know FHIR. Collaborate with clinicians.",
      rt(
        pack([
          { text: "FHIR", kind: "technical", priority: "must" },
          { text: "Healthcare SaaS domain", kind: "domain", priority: "must" },
          { text: "Collaborate with clinicians", kind: "behavioural", priority: "must" },
        ]),
      ),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(new Set(result.data.map((r) => r.kind)).size).toBe(3);
    }
  });

  it("keeps a tiny two-line JD thin", async () => {
    const result = await extractRequirements(
      "Python developer.\nNice to have AWS.",
      rt(
        pack([
          { text: "Python", kind: "technical", priority: "must" },
          { text: "AWS", kind: "technical", priority: "nice" },
        ]),
      ),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.length).toBe(2);
      expect(result.data.map((r) => r.priority).sort()).toEqual(["must", "nice"]);
    }
  });

  it("honors explicit must-have wording", async () => {
    const result = await extractRequirements(
      "Must have 5 years of Go. Required: distributed systems.",
      rt(
        pack([
          { text: "5 years of Go", kind: "technical", priority: "must" },
          { text: "Distributed systems", kind: "technical", priority: "must" },
        ]),
      ),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.every((r) => r.priority === "must")).toBe(true);
  });

  it("honors preferred / nice-to-have wording", async () => {
    const result = await extractRequirements(
      "Preferred: GraphQL. Nice to have: Rust. A plus: public speaking.",
      rt(
        pack([
          { text: "GraphQL", kind: "technical", priority: "nice" },
          { text: "Rust", kind: "technical", priority: "nice" },
          { text: "Public speaking", kind: "behavioural", priority: "nice" },
        ]),
      ),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.every((r) => r.priority === "nice")).toBe(true);
  });

  it("returns structured failure on malformed LLM JSON", async () => {
    const result = await extractRequirements("Any JD text long enough.", rt("NOT JSON {", { maxRepairAttempts: 0 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(["INVALID_JSON", "SCHEMA"]).toContain(result.error.code);
  });

  it("rejects an invalid requirement kind", async () => {
    const result = await extractRequirements(
      "Required: kindness.",
      rt(pack([{ text: "Kindness", kind: "soft_skill", priority: "must" }]), { maxRepairAttempts: 0 }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SCHEMA");
  });

  it("rejects an invalid priority", async () => {
    const result = await extractRequirements(
      "Required: Go.",
      rt(pack([{ text: "Go", kind: "technical", priority: "critical" }]), { maxRepairAttempts: 0 }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SCHEMA");
  });

  it("assigns the same stable id for the same text/kind/priority", async () => {
    const payload = pack([{ text: "TypeScript", kind: "technical", priority: "must" }]);
    const a = await extractRequirements("TypeScript required.", rt(payload));
    const b = await extractRequirements("TypeScript required.", rt(payload));
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.data[0]!.id).toBe(b.data[0]!.id);
    if (a.ok) expect(ExtractedRequirementSchema.safeParse(a.data[0]).success).toBe(true);
  });
});

describe("Phase 2 kind/priority enums", () => {
  it("allows only technical | behavioural | domain and must | nice", () => {
    expect(RequirementKindSchema.safeParse("technical").success).toBe(true);
    expect(RequirementKindSchema.safeParse("leadership").success).toBe(false);
    expect(ExtractedPrioritySchema.safeParse("must").success).toBe(true);
    expect(ExtractedPrioritySchema.safeParse("must_have").success).toBe(false);
  });
});
