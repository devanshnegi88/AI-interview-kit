import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app";

describe("GET /health", () => {
  const app = createApp();

  it("returns 200 with a success envelope", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("ok");
  });

  it("reports a db status field even without a live connection", async () => {
    const res = await request(app).get("/health");
    expect(["connected", "connecting", "disconnected", "unknown"]).toContain(res.body.data.db);
  });
});

describe("unknown routes", () => {
  it("returns a 404 envelope", async () => {
    const app = createApp();
    const res = await request(app).get("/definitely-not-a-route");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
