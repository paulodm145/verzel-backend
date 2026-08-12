import { loadDotEnvFile } from "./dotenv.js";
import { loadEnv, type Env } from "./env.js";

let cached: Env | undefined;

/**
 * Ambiente validado, resolvido na primeira chamada e memorizado.
 *
 * Preguiçoso de propósito: se a validação rodasse na importação do módulo,
 * qualquer teste unitário que importasse algo desta árvore exigiria um ambiente
 * completo. `server.ts` chama isto antes de qualquer outra coisa, o que garante
 * a falha na partida exigida pela RN-6.
 *
 * O `.env` é carregado aqui, e não em `server.ts`: como os imports ESM são
 * avaliados antes do corpo do módulo, um carregamento no ponto de entrada
 * chegaria tarde demais para quem lê o ambiente na importação (`lib/prisma.ts`).
 */
export function getEnv(): Env {
  if (cached === undefined) {
    loadDotEnvFile();
    cached = loadEnv(process.env);
  }

  return cached;
}

export type { Env };
