import { loadEnv, type Env } from "./env.js";

let cached: Env | undefined;

/**
 * Ambiente validado, resolvido na primeira chamada e memorizado.
 *
 * Preguiçoso de propósito: se a validação rodasse na importação do módulo,
 * qualquer teste unitário que importasse algo desta árvore exigiria um ambiente
 * completo. `server.ts` chama isto antes de qualquer outra coisa, o que garante
 * a falha na partida exigida pela RN-6.
 */
export function getEnv(): Env {
  cached ??= loadEnv(process.env);

  return cached;
}

export type { Env };
