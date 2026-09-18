import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { UserModel } from "../auth/models";
import { KitModel } from "../kits/models";
import { resetAuthCollections, startTestMongo, stopTestMongo } from "./helpers/mongo";

const app = createApp();

describe("phase 14 editing and safe regeneration", () => {
  beforeAll(async () => {
    await startTestMongo();
  }, 180_000);

  afterEach(async () => {
    await resetAuthCollections();
    await KitModel.deleteMany({});
  });

  afterAll(async () => {
    await stopTestMongo();
  }, 180_000);

  it("preserves edited and pinned questions while regenerating generated ones", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: "phase14a@example.com", password: "correct-horse-battery" });
    const user = await UserModel.findOne({ email: "phase14a@example.com" });

    const baseKit = await KitModel.create({
      ownerId: user!._id,
      status: "ready",
      input: { job_description: "Senior engineer", company_url: "https://example.com", days_available: 5, hours_per_day: 2 },
      source: { job_description: "Senior engineer", company_url: "https://example.com", days_available: 5, hours_per_day: 2 },
      company_brief: { name: "Example", one_liner: "Builds product", products: ["Platform"], culture: ["Friendly"], interview_process: ["Screen"], recent_news: [], citations: [], state: "generated" },
      role: {
        title: "Senior Engineer",
        level: "senior",
        requirements: [{ id: "req_a123", text: "Ship systems", priority: "must_have" }],
        responsibilities: ["Ship features"],
      },
      questions: [
        { id: "q_edited1", type: "technical", difficulty: "medium", prompt: "Original edited question", why_asked: "Tests correctness", requirement_ids: ["req_a123"], tags: ["technical"], answer_outline: ["Design"], follow_ups: [], estimated_minutes: 20, state: "edited" },
        { id: "q_generated2", type: "technical", difficulty: "easy", prompt: "Generated question", why_asked: "Covers basics", requirement_ids: ["req_a123"], tags: ["technical"], answer_outline: ["Explain"], follow_ups: [], estimated_minutes: 15, state: "generated" },
        { id: "q_pinned3", type: "behavioral", difficulty: "hard", prompt: "Pinned question", why_asked: "Behavioral check", requirement_ids: ["req_a123"], tags: ["behavioral"], answer_outline: ["Story"], follow_ups: [], estimated_minutes: 25, state: "pinned" },
      ],
      flashcards: [
        { id: "fc_1", front: "Example", back: "Answer", requirement_ids: ["req_a123"], state: "generated" },
      ],
      schedule: [],
      coverage: null,
      fieldState: { input: "done", research: "done", requirements: "done", questions: "done", flashcards: "done", schedule: "done", validation: "done" },
      practiceState: { mode: "off", currentDay: null, currentItemId: null, completedCount: 0, startedAt: null, updatedAt: null },
      error: null,
    });

    const patchRes = await agent.patch(`/api/kits/${baseKit._id}/questions/q_edited1`).send({ prompt: "Updated edited prompt", state: "edited" });
    expect(patchRes.status).toBe(200);

    const addRes = await agent.post(`/api/kits/${baseKit._id}/questions`).send({
      id: "q_user4",
      type: "company",
      difficulty: "medium",
      prompt: "User added question",
      why_asked: "Specific to team",
      requirement_ids: ["req_a123"],
      tags: ["company"],
      answer_outline: ["Discuss company goals"],
      follow_ups: [],
      estimated_minutes: 20,
      state: "edited",
    });
    expect(addRes.status).toBe(201);

    const regenerate = await agent.post(`/api/kits/${baseKit._id}/regenerate/questions`);
    expect(regenerate.status).toBe(200);

    const reloaded = regenerate.body.data;
    const questionMap = new Map(reloaded.questions.map((q: any) => [q.id, q]));
    expect(questionMap.get("q_edited1").prompt).toBe("Updated edited prompt");
    expect(questionMap.get("q_edited1").state).toBe("edited");
    expect(questionMap.get("q_generated2").state).toBe("generated");
    expect(questionMap.get("q_pinned3").state).toBe("pinned");
    expect(questionMap.get("q_user4").prompt).toBe("User added question");
    expect(questionMap.get("q_user4").state).toBe("edited");
  });

  it("preserves an edited company brief across unrelated regeneration", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: "phase14b@example.com", password: "correct-horse-battery" });
    const user = await UserModel.findOne({ email: "phase14b@example.com" });

    const baseKit = await KitModel.create({
      ownerId: user!._id,
      status: "ready",
      input: { job_description: "Senior engineer", company_url: "https://example.com", days_available: 5, hours_per_day: 2 },
      source: { job_description: "Senior engineer", company_url: "https://example.com", days_available: 5, hours_per_day: 2 },
      company_brief: { name: "Example", one_liner: "Original company summary", products: ["Platform"], culture: ["Friendly"], interview_process: ["Screen"], recent_news: [], citations: [], state: "edited" },
      role: {
        title: "Senior Engineer",
        level: "senior",
        requirements: [{ id: "req_b123", text: "Ship systems", priority: "must_have" }],
        responsibilities: ["Ship features"],
      },
      questions: [
        { id: "q_b1", type: "technical", difficulty: "medium", prompt: "Question one", why_asked: "Reason", requirement_ids: ["req_b123"], tags: ["technical"], answer_outline: ["Explain"], follow_ups: [], estimated_minutes: 20, state: "generated" },
      ],
      flashcards: [{ id: "fc_b1", front: "Question", back: "Answer", requirement_ids: ["req_b123"], state: "generated" }],
      schedule: [],
      coverage: null,
      fieldState: { input: "done", research: "done", requirements: "done", questions: "done", flashcards: "done", schedule: "done", validation: "done" },
      practiceState: { mode: "off", currentDay: null, currentItemId: null, completedCount: 0, startedAt: null, updatedAt: null },
      error: null,
    });

    const editBrief = await agent.patch(`/api/kits/${baseKit._id}/company-brief`).send({ one_liner: "User-edited summary", state: "edited" });
    expect(editBrief.status).toBe(200);
    expect(editBrief.body.data.company_brief.one_liner).toBe("User-edited summary");

    const regenerateBrief = await agent.post(`/api/kits/${baseKit._id}/regenerate/brief`);
    expect(regenerateBrief.status).toBe(200);
    expect(regenerateBrief.body.data.company_brief.one_liner).toBe("User-edited summary");
    expect(regenerateBrief.body.data.company_brief.state).toBe("edited");
  });
});
