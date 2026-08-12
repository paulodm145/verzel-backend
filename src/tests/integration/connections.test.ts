import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "../../shared/lib/prisma.js";
import { getRedis, isRedisReady, disconnectRedis } from "../../shared/lib/redis.js";

/**
 * Exercita o client compartilhado, o mesmo que a aplicação usa. Durante os
 * testes ele aponta para o banco de teste: `tests/setup.ts` troca DATABASE_URL
 * por TEST_DATABASE_URL antes de qualquer import.
 */
describe("conexões de infraestrutura", () => {
  afterAll(async () => {
    await prisma.$disconnect();
    await disconnectRedis();
  });

  it("aponta para o banco de teste, nunca para o de desenvolvimento", async () => {
    const expected = new URL(process.env.TEST_DATABASE_URL ?? "").pathname.slice(
      1,
    );

    const rows =
      await prisma.$queryRawUnsafe<{ current_database: string }[]>(
        "SELECT current_database()",
      );

    expect(rows[0]?.current_database).toBe(expected);
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
