import { createApp } from "./app.js";
import { getEnv } from "./shared/config/index.js";
import { getLogger } from "./shared/lib/logger.js";
import { disconnectPrisma } from "./shared/lib/prisma.js";
import { disconnectRedis } from "./shared/lib/redis.js";

// Primeira coisa a rodar: ambiente incompleto derruba o processo aqui, com a
// variável faltante nomeada, em vez de falhar na primeira requisição que a use
const env = getEnv();
const logger = getLogger();

const server = createApp().listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "servidor no ar");
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "encerrando o servidor");

  // Parar de aceitar conexões antes de fechar o banco, para que requisição em
  // andamento não perca a conexão no meio
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });

  await Promise.allSettled([disconnectPrisma(), disconnectRedis()]);

  logger.info("servidor encerrado");
  process.exit(0);
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}
