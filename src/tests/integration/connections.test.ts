import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "../../shared/lib/prisma.js";
import { getRedis, isRedisReady, disconnectRedis } from "../../shared/lib/redis.js";

describe("conexões de infraestrutura", () => {
  afterAll(async () => {
    await prisma.$disconnect();
    await disconnectRedis();
  });

  it("consulta o Postgres pelo client compartilhado", async () => {
    const rows = await prisma.$queryRawUnsafe<{ ok: number }[]>("SELECT 1 AS ok");

    expect(rows[0]?.ok).toBe(1);
  });

  it("responde ao ping do Redis", async () => {
    const redis = await getRedis();

    await expect(redis.ping()).resolves.toBe("PONG");
  });

  it("reporta o Redis como pronto depois de conectar", async () => {
    await getRedis();

    expect(isRedisReady()).toBe(true);
  });

  it("reaproveita a mesma conexão em chamadas sucessivas", async () => {
    const first = await getRedis();
    const second = await getRedis();

    expect(second).toBe(first);
  });
});
