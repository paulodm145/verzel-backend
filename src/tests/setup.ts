import { existsSync } from "node:fs";

/**
 * Carrega o .env antes dos testes. Usa o carregador nativo do Node em vez de
 * dotenv — o generator `prisma-client` do Prisma 7 não carrega .env em runtime,
 * então a responsabilidade é da aplicação, e o runtime já resolve.
 */
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

// Log desligado por padrão: a saída dos testes deve mostrar falhas, não ruído.
// O teste que precisa inspecionar o log constrói o seu próprio logger.
process.env.LOG_LEVEL = "silent";
process.env.NODE_ENV = "test";

// O client compartilhado (lib/prisma.ts) lê DATABASE_URL. Sem esta troca, todo
// teste que o importa cai no banco de desenvolvimento — e basta um deles passar
// a escrever para apagar dados de trabalho. A separação vira garantia do
// ambiente inteiro, não promessa de quem lembra de usar o helper.
if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL não definida. Os testes de integração exigem um banco " +
      "separado — ver .env.example.",
  );
}

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
