import { createClient, type RedisClientType } from "redis";

import { getEnv } from "../config/index.js";
import { getLogger } from "./logger.js";

const CONNECT_TIMEOUT_MS = 2_000;
const MAX_CONNECT_ATTEMPTS = 3;

let connection: Promise<RedisClientType> | undefined;
let ready = false;

/**
 * Abre uma conexão que **desiste** em vez de tentar para sempre.
 *
 * A `reconnectStrategy` padrão do node-redis v6 nunca devolve erro: ela sempre
 * pede outra tentativa, e `connect()` fica pendente enquanto o Redis estiver
 * fora. Numa checagem de saúde isso não é "degradado", é a requisição travada.
 * Devolver um `Error` depois de algumas tentativas faz a promessa rejeitar, que
 * é o caso que o chamador sabe tratar (ADR 0003).
 *
 * Exportada para que o teste exercite este caminho de verdade, contra uma porta
 * fechada, em vez de um dublê que rejeita — foi o dublê que escondeu a falha.
 */
export async function openRedisConnection(
  url: string,
): Promise<RedisClientType> {
  const client: RedisClientType = createClient({
    url,
    socket: {
      connectTimeout: CONNECT_TIMEOUT_MS,
      reconnectStrategy: (attempts) =>
        attempts >= MAX_CONNECT_ATTEMPTS
          ? new Error(`Redis inalcançável após ${String(MAX_CONNECT_ATTEMPTS)} tentativas`)
          : Math.min(100 * 2 ** attempts, CONNECT_TIMEOUT_MS),
    },
  });

  client.on("error", (error: Error) => {
    ready = false;
    getLogger().warn({ err: error }, "falha na conexão com o Redis");
  });
  client.on("ready", () => {
    ready = true;
  });
  client.on("end", () => {
    ready = false;
  });

  try {
    await client.connect();
  } catch (error) {
    // Cliente que não conectou ainda segura socket e temporizador
    client.destroy();
    throw error;
  }

  return client;
}

/**
 * Conexão compartilhada, aberta na primeira chamada.
 *
 * O que fica memorizado é a **promessa**, não o cliente: guardar o cliente só
 * depois do `await` deixava duas chamadas concorrentes abrirem duas conexões, e
 * a perdedora ficava aberta para sempre, fora do alcance do desligamento.
 *
 * O Redis é infraestrutura auxiliar — locks e cache. A aplicação precisa
 * continuar de pé sem ele (ADR 0003), então a falha é registrada e propagada
 * para quem chamou decidir, em vez de derrubar o processo.
 */
export function getRedis(): Promise<RedisClientType> {
  connection ??= openRedisConnection(getEnv().REDIS_URL).catch(
    (error: unknown) => {
      // Sem isto a primeira falha ficaria memorizada e o Redis nunca mais seria
      // tentado, nem depois de voltar
      connection = undefined;
      throw error;
    },
  );

  return connection;
}

export function isRedisReady(): boolean {
  return ready;
}

export async function disconnectRedis(): Promise<void> {
  const current = connection;

  connection = undefined;
  ready = false;

  if (!current) {
    return;
  }

  // Conexão que falhou já se fechou sozinha; só a bem-sucedida precisa fechar
  const client = await current.catch(() => undefined);

  await client?.close();
}
