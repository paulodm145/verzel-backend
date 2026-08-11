import { createClient, type RedisClientType } from "redis";

import { getEnv } from "../config/index.js";

let client: RedisClientType | undefined;
let ready = false;

/**
 * Conexão compartilhada com o Redis, aberta na primeira chamada.
 *
 * O Redis é infraestrutura auxiliar: locks e cache. A aplicação precisa
 * continuar de pé sem ele (ADR 0003), então o erro de conexão é registrado e o
 * estado marcado como não pronto, em vez de derrubar o processo.
 */
export async function getRedis(): Promise<RedisClientType> {
  if (client) {
    return client;
  }

  const created: RedisClientType = createClient({ url: getEnv().REDIS_URL });

  created.on("error", () => {
    ready = false;
  });
  created.on("ready", () => {
    ready = true;
  });
  created.on("end", () => {
    ready = false;
  });

  await created.connect();
  client = created;

  return client;
}

export function isRedisReady(): boolean {
  return ready;
}

export async function disconnectRedis(): Promise<void> {
  if (!client) {
    return;
  }

  await client.close();
  client = undefined;
  ready = false;
}
