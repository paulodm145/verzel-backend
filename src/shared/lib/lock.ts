import { randomUUID } from "node:crypto";

import type { RedisClientType } from "redis";

import { ConflictError } from "../errors/index.js";
import { getLogger } from "./logger.js";
import { getRedis } from "./redis.js";

export type RedisProvider = () => Promise<RedisClientType>;

export interface LockOptions {
  readonly ttlMs: number;
  /** Mensagem do 409 quando outro pedido está com o lock. */
  readonly conflictMessage: string;
  /**
   * De onde vem a conexão. Injetável para que o teste possa exercitar o
   * caminho "Redis fora do ar" de verdade, em vez de confiar que ele existe.
   */
  readonly redisProvider?: RedisProvider;
}

/**
 * Executa `work` com exclusão mútua, quando o Redis está disponível.
 *
 * Duas decisões deste arquivo vêm direto do
 * [ADR 0003](../../../docs/adr/0003-lock-redis-com-constraint-no-banco.md):
 *
 * 1. **Quem não adquire o lock recebe 409 na hora**, sem fila de espera. Esperar
 *    numa requisição HTTP só transfere o congestionamento para o cliente, e o
 *    assento provavelmente já terá sido levado quando a vez chegar.
 * 2. **Redis fora do ar não impede a venda.** O trabalho roda sem lock, e a
 *    constraint do banco continua sendo a garantia real. Recusar toda reserva
 *    porque o cache caiu transformaria degradação em indisponibilidade.
 */
export async function withLock<T>(
  key: string,
  options: LockOptions,
  work: () => Promise<T>,
): Promise<T> {
  const token = randomUUID();
  const provideRedis = options.redisProvider ?? getRedis;

  try {
    const redis = await provideRedis();
    const acquired = await redis.set(key, token, {
      condition: "NX",
      expiration: { type: "PX", value: options.ttlMs },
    });

    if (acquired !== "OK") {
      throw new ConflictError(options.conflictMessage);
    }
  } catch (error) {
    // ConflictError é resposta de negócio, não falha de infraestrutura
    if (error instanceof ConflictError) {
      throw error;
    }

    getLogger().warn(
      { err: error, key },
      "lock indisponível; seguindo sem ele — a constraint do banco garante",
    );

    return work();
  }

  try {
    return await work();
  } finally {
    await releaseLock(key, token, provideRedis);
  }
}

/**
 * Solta o lock apenas se ele ainda for nosso. Sem essa checagem, um trabalho
 * que passasse do TTL apagaria o lock de quem veio depois.
 */
async function releaseLock(
  key: string,
  token: string,
  provideRedis: RedisProvider,
): Promise<void> {
  try {
    const redis = await provideRedis();
    const current = await redis.get(key);

    if (current === token) {
      await redis.del(key);
    }
  } catch {
    // O TTL solta sozinho; falhar aqui não pode derrubar a resposta
  }
}

export function seatLockKey(eventId: string, seatId: string): string {
  return `lock:seat:${eventId}:${seatId}`;
}
