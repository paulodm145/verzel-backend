import { existsSync } from "node:fs";

/**
 * Carrega um arquivo `.env` para dentro de `process.env`, se ele existir.
 *
 * Usa o carregador nativo do Node em vez de `dotenv`: uma dependência a menos
 * para fazer o que o runtime já faz. Variável já presente no ambiente vence a do
 * arquivo — em produção o `.env` não existe e a configuração vem do ambiente de
 * verdade, então a ausência do arquivo é um caso normal, não um erro.
 */
export function loadDotEnvFile(path = ".env"): void {
  if (!existsSync(path)) {
    return;
  }

  process.loadEnvFile(path);
}
