import { existsSync } from "node:fs";

/**
 * Carrega o .env antes dos testes. Usa o carregador nativo do Node em vez de
 * dotenv — o generator `prisma-client` do Prisma 7 não carrega .env em runtime,
 * então a responsabilidade é da aplicação, e o runtime já resolve.
 */
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}
