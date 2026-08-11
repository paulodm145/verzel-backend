/**
 * Prepara o banco de teste: aplica as migrations em TEST_DATABASE_URL.
 *
 * Existe porque o Prisma CLI lê a conexão de prisma.config.ts, que aponta para
 * DATABASE_URL. Rodar as migrations contra o banco de teste exige sobrescrever
 * essa variável só para este comando — fazer isso à mão toda vez é o tipo de
 * passo que se erra e leva a aplicar migration no banco errado.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  console.error(
    "TEST_DATABASE_URL não definida. Copie o .env.example e preencha.",
  );
  process.exit(1);
}

if (testDatabaseUrl === process.env.DATABASE_URL) {
  console.error(
    "TEST_DATABASE_URL é igual a DATABASE_URL. Os testes truncam as tabelas — " +
      "apontar os dois para o mesmo banco apagaria os dados de desenvolvimento.",
  );
  process.exit(1);
}

execFileSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: testDatabaseUrl },
});
