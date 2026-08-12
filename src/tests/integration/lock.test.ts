import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { ConflictError } from "../../shared/errors/index.js";
import { seatLockKey, withLock } from "../../shared/lib/lock.js";
import { disconnectRedis, getRedis } from "../../shared/lib/redis.js";

const options = { ttlMs: 2000, conflictMessage: "assento em disputa" };

describe("withLock", () => {
  beforeEach(async () => {
    const redis = await getRedis();
    await redis.del(seatLockKey("evento", "assento"));
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  it("executa o trabalho e solta o lock ao final", async () => {
    const key = seatLockKey("evento", "assento");

    await expect(withLock(key, options, () => Promise.resolve("feito"))).resolves.toBe(
      "feito",
    );

    const redis = await getRedis();
    await expect(redis.get(key)).resolves.toBeNull();
  });

  it("recusa o segundo pedido enquanto o primeiro está dentro", async () => {
    const key = seatLockKey("evento", "assento");
    let segundoErro: unknown;

    await withLock(key, options, async () => {
      segundoErro = await withLock(key, options, () =>
        Promise.resolve("não deveria rodar"),
      ).catch((error: unknown) => error);
    });

    expect(segundoErro).toBeInstanceOf(ConflictError);
  });

  it("libera o lock mesmo quando o trabalho falha", async () => {
    const key = seatLockKey("evento", "assento");

    await expect(
      withLock(key, options, () => Promise.reject(new Error("falhou"))),
    ).rejects.toThrow("falhou");

    const redis = await getRedis();
    await expect(redis.get(key)).resolves.toBeNull();
  });

  it("não apaga o lock de outro dono quando o trabalho passa do TTL", async () => {
    const key = seatLockKey("evento", "assento");
    const redis = await getRedis();

    await withLock(key, { ...options, ttlMs: 50 }, async () => {
      // Enquanto este trabalho roda, o lock vence e outro pedido o toma
      await new Promise((resolve) => setTimeout(resolve, 120));
      await redis.set(key, "token-de-outro");
    });

    // O lock do outro segue de pé: soltar o alheio deixaria dois dentro
    await expect(redis.get(key)).resolves.toBe("token-de-outro");
    await redis.del(key);
  });

  it("segue trabalhando com o Redis fora do ar", async () => {
    // Conexão que sempre falha, como um Redis derrubado. Trocar a REDIS_URL
    // não serviria: o ambiente é memorizado na primeira leitura.
    const semRedis = () => Promise.reject(new Error("Redis inalcançável"));

    // O trabalho roda mesmo sem lock: a constraint do banco é quem garante
    await expect(
      withLock(
        "lock:qualquer",
        { ...options, redisProvider: semRedis },
        () => Promise.resolve("rodou"),
      ),
    ).resolves.toBe("rodou");
  });

  it("com o Redis fora, dois pedidos entram — e é por isso que o banco garante", async () => {
    const semRedis = () => Promise.reject(new Error("Redis inalcançável"));
    const dentro: string[] = [];

    await Promise.all(
      ["primeiro", "segundo"].map((nome) =>
        withLock("lock:qualquer", { ...options, redisProvider: semRedis }, () => {
          dentro.push(nome);

          return Promise.resolve();
        }),
      ),
    );

    // Sem lock não há exclusão mútua: a integridade passa a depender só da
    // constraint, e o teste de concorrência prova que ela segura
    expect(dentro).toHaveLength(2);
  });
});
