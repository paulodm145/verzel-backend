import { afterAll, describe, expect, it } from "vitest";

import { checkHealth } from "../../modules/health/health.service.js";
import {
  disconnectRedis,
  getRedis,
  openRedisConnection,
} from "../../shared/lib/redis.js";

// Porta fechada: a conexão é recusada de imediato, sem depender de rede externa
const UNREACHABLE_URL = "redis://127.0.0.1:1";

const databaseUp = () => Promise.resolve(true);

async function pingThrough(url: string): Promise<boolean> {
  const redis = await openRedisConnection(url);

  return (await redis.ping()) === "PONG";
}

describe("Redis fora do ar", () => {
  afterAll(async () => {
    await disconnectRedis();
  });

  it("desiste de conectar em vez de tentar reconectar para sempre", async () => {
    await expect(openRedisConnection(UNREACHABLE_URL)).rejects.toThrow();
  });

  it("responde degradado usando o caminho real de conexão, não um dublê", async () => {
    // O teste do CA-7 em health.test.ts injeta uma checagem que rejeita — um
    // caminho que o getRedis real não tomava. Aqui a conexão é de verdade.
    const report = await checkHealth({
      database: databaseUp,
      cache: () => pingThrough(UNREACHABLE_URL),
    });

    expect(report.status).toBe("degraded");
    expect(report.services.cache).toBe("down");
  });

  it("abre uma única conexão quando duas chamadas chegam juntas", async () => {
    await disconnectRedis();

    const [first, second] = await Promise.all([getRedis(), getRedis()]);

    expect(second).toBe(first);
  });
});
