import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  // `silent` desliga o log; usado pelos testes para manter a saída limpa
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  DATABASE_URL: z.string().min(1, "obrigatória"),
  REDIS_URL: z.string().min(1, "obrigatória"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Valida um conjunto de variáveis de ambiente. Função pura: recebe a fonte em
 * vez de ler `process.env`, o que permite testá-la sem manipular o ambiente do
 * processo.
 *
 * Falha listando **todas** as variáveis com problema, não só a primeira — quem
 * está configurando o ambiente pela primeira vez costuma errar mais de uma.
 */
export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);

  if (result.success) {
    return result.data;
  }

  const problems = result.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  throw new Error(
    `Variáveis de ambiente inválidas ou ausentes:\n${problems}\n\n` +
      "Confira o .env contra o .env.example.",
  );
}
