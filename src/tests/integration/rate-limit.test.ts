import express from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { errorHandler } from "../../shared/middlewares/error-handler.js";
import {
  byIpAndEmail,
  rateLimit,
} from "../../shared/middlewares/rate-limit.js";
import { requestId } from "../../shared/middlewares/request-id.js";
import { disconnectRedis, getRedis } from "../../shared/lib/redis.js";

const scope = `teste-${String(Date.now())}`;

function buildApp() {
  const app = express();

  app.use(requestId);
  app.use(express.json());
  app.post(
    "/tentativa",
    rateLimit({ scope, max: 3, windowSeconds: 60, identify: byIpAndEmail }),
    (_request, response) => {
      response.json({ ok: true });
    },
  );
  app.use(errorHandler);

  return app;
}

const app = buildApp();

beforeEach(async () => {
  const redis = await getRedis();
  const keys = await redis.keys(`ratelimit:${scope}:*`);

  if (keys.length > 0) {
    await redis.del(keys);
  }
});

afterAll(async () => {
  await disconnectRedis();
});

describe("limite de tentativas", () => {
  it("deixa passar dentro do limite", async () => {
    for (let tentativa = 0; tentativa < 3; tentativa += 1) {
      const response = await request(app)
        .post("/tentativa")
        .send({ email: "alvo@example.com" });

      expect(response.status).toBe(200);
    }
  });

  it("recusa a partir da quarta tentativa contra a mesma conta", async () => {
    for (let tentativa = 0; tentativa < 3; tentativa += 1) {
      await request(app).post("/tentativa").send({ email: "alvo@example.com" });
    }

    const bloqueada = await request(app)
      .post("/tentativa")
      .send({ email: "alvo@example.com" });

    expect(bloqueada.status).toBe(429);
    expect(bloqueada.body.error.code).toBe("TOO_MANY_REQUESTS");
  });

  it("conta por conta alvo: bloquear uma não bloqueia a outra", async () => {
    for (let tentativa = 0; tentativa < 4; tentativa += 1) {
      await request(app).post("/tentativa").send({ email: "alvo@example.com" });
    }

    const outra = await request(app)
      .post("/tentativa")
      .send({ email: "outra-conta@example.com" });

    expect(outra.status).toBe(200);
  });
});
