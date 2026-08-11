import express from "express";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { createHealthRouter } from "../../modules/health/health.routes.js";
import { errorHandler } from "../../shared/middlewares/error-handler.js";
import { prisma } from "../../shared/lib/prisma.js";
import { disconnectRedis } from "../../shared/lib/redis.js";

function buildAppWith(checks: {
  database: () => Promise<boolean>;
  cache: () => Promise<boolean>;
}) {
  const app = express();
  app.use(createHealthRouter(checks));
  app.use(errorHandler);

  return app;
}

const up = () => Promise.resolve(true);
const down = () => Promise.resolve(false);
const explodes = () => Promise.reject(new Error("conexão recusada"));

describe("GET /health", () => {
  afterAll(async () => {
    await prisma.$disconnect();
    await disconnectRedis();
  });

  it("reporta 200 e ambos os serviços quando tudo está no ar", async () => {
    const response = await request(buildAppWith({ database: up, cache: up })).get(
      "/health",
    );

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.services).toEqual({
      database: "up",
      cache: "up",
    });
  });

  it("segue respondendo 200 com o Redis fora, marcando degradação", async () => {
    const response = await request(
      buildAppWith({ database: up, cache: down }),
    ).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("degraded");
    expect(response.body.services.cache).toBe("down");
  });

  it("não deixa a exceção do Redis escapar como falha da rota", async () => {
    const response = await request(
      buildAppWith({ database: up, cache: explodes }),
    ).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.services.cache).toBe("down");
  });

  it("reporta 503 quando o banco está fora — sem ele não há serviço", async () => {
    const response = await request(
      buildAppWith({ database: down, cache: up }),
    ).get("/health");

    expect(response.status).toBe(503);
    expect(response.body.status).toBe("error");
  });

  it("responde contra a infraestrutura real montada pela aplicação", async () => {
    const response = await request(createApp()).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.services).toEqual({ database: "up", cache: "up" });
  });
});
