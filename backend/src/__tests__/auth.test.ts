import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Request, Response } from "express";
import { createApp } from "../app";
import { expireSessionForTests } from "../auth/sessions";
import { requireOwner, ignoreClientOwnerId } from "../auth/ownership";
import { SESSION_COOKIE } from "../auth/cookies";
import { SessionModel, UserModel } from "../auth/models";
import { resetAuthCollections, startTestMongo, stopTestMongo } from "./helpers/mongo";

const app = createApp();
const email = "user@example.com";
const password = "correct-horse-battery";

describe("auth API", () => {
  beforeAll(async () => {
    await startTestMongo();
  }, 60_000);

  afterEach(async () => {
    await resetAuthCollections();
  });

  afterAll(async () => {
    await stopTestMongo();
  });

  it("registers a user, hashes the password, and sets an HTTP-only session cookie", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "User@Example.com", password });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe("user@example.com");
    expect(res.body.data.id).toBeTruthy();
    expect(res.body.data.passwordHash).toBeUndefined();
    expect(res.headers["set-cookie"]?.join(";")).toMatch(new RegExp(`${SESSION_COOKIE}=`));
    expect(res.headers["set-cookie"]?.join(";")).toMatch(/HttpOnly/i);

    const stored = await UserModel.findOne({ email: "user@example.com" }).select("+passwordHash");
    expect(stored?.passwordHash).toBeTruthy();
    expect(stored?.passwordHash).not.toBe(password);
  });

  it("rejects a duplicate email", async () => {
    await request(app).post("/api/auth/register").send({ email, password });
    const res = await request(app).post("/api/auth/register").send({ email, password });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it("logs in with valid credentials", async () => {
    await request(app).post("/api/auth/register").send({ email, password });
    const res = await request(app).post("/api/auth/login").send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(email);
    expect(res.headers["set-cookie"]?.join(";")).toMatch(new RegExp(`${SESSION_COOKIE}=`));
  });

  it("fails login with the same message for unknown email and wrong password", async () => {
    await request(app).post("/api/auth/register").send({ email, password });
    const unknown = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password });
    const wrong = await request(app).post("/api/auth/login").send({ email, password: "wrong-password" });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error).toBe(wrong.body.error);
  });

  it("returns the current user on GET /api/auth/me", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email, password });
    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(email);
  });

  it("logs out and rejects the old session", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email, password });
    const out = await agent.post("/api/auth/logout");
    expect(out.status).toBe(200);
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(401);
  });

  it("rejects an invalid session cookie", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", `${SESSION_COOKIE}=not-a-real-session.00`);
    expect(res.status).toBe(401);
  });

  it("rejects an expired session", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email, password });
    const me1 = await agent.get("/api/auth/me");
    expect(me1.status).toBe(200);

    const user = await UserModel.findOne({ email });
    const sessions = await SessionModel.find({ userId: user!._id });
    expect(sessions.length).toBeGreaterThan(0);
    for (const s of sessions) {
      await expireSessionForTests(s.sessionId);
    }

    const me2 = await agent.get("/api/auth/me");
    expect(me2.status).toBe(401);
  });

  it("protects GET /api/kits", async () => {
    const denied = await request(app).get("/api/kits");
    expect(denied.status).toBe(401);

    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email, password });
    const allowed = await agent.get("/api/kits");
    expect(allowed.status).toBe(200);
    expect(allowed.body.data).toEqual([]);
  });
});

describe("requireOwner foundation", () => {
  function mockRes(): Response & { statusCode: number; body: unknown } {
    const res = {
      statusCode: 200,
      body: undefined as unknown,
      status(code: number) {
        res.statusCode = code;
        return res;
      },
      json(body: unknown) {
        res.body = body;
        return res;
      },
    };
    return res as unknown as Response & { statusCode: number; body: unknown };
  }

  it("returns 401 when unauthenticated", async () => {
    const mw = requireOwner(async () => "owner-1");
    const res = mockRes();
    let next = false;
    await mw({} as Request, res, () => {
      next = true;
    });
    expect(res.statusCode).toBe(401);
    expect(next).toBe(false);
  });

  it("returns 403 when the stored owner does not match req.user.id", async () => {
    const mw = requireOwner(async () => "other-user");
    const res = mockRes();
    let next = false;
    await mw({ user: { id: "me", email } } as Request, res, () => {
      next = true;
    });
    expect(res.statusCode).toBe(403);
    expect(next).toBe(false);
  });

  it("calls next when the stored owner matches", async () => {
    const mw = requireOwner(async () => "me");
    const res = mockRes();
    let next = false;
    await mw({ user: { id: "me", email } } as Request, res, () => {
      next = true;
    });
    expect(next).toBe(true);
  });

  it("strips client-supplied ownerId / userId", () => {
    expect(ignoreClientOwnerId({ title: "x", ownerId: "attacker", userId: "attacker" })).toEqual({
      title: "x",
    });
  });
});
