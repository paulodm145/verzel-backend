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
  // 32 caracteres é o piso para uma chave HS256 não ser o elo fraco da
  // assinatura: um segredo curto é atacável por força bruta offline
  JWT_SECRET: z.string().min(32, "precisa de ao menos 32 caracteres"),
  // Em segundos. O de acesso é curto porque não há como revogá-lo; o de
  // renovação é longo porque pode ser revogado a qualquer momento (ADR 0010)
  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(604_800),
  // Catálogo externo: as duas chaves são opcionais, e a fábrica instancia
  // apenas o provedor que tiver a sua. Sem nenhuma, a busca responde vazio e o
  // resto do sistema segue de pé (RN-2 da spec 0003)
  TMDB_API_KEY: z.string().min(1).optional(),
  TICKETMASTER_API_KEY: z.string().min(1).optional(),
  CATALOG_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  CATALOG_CACHE_TTL: z.coerce.number().int().positive().default(600),
  // Prazo da reserva pendente, em segundos: tempo de pagar sem prender o
  // assento para sempre
  RESERVATION_TTL: z.coerce.number().int().positive().default(600),
  // Vida do lock de assento. Curto de propósito: se o processo morrer segurando
  // o lock, o assento não pode ficar bloqueado até alguém perceber
  SEAT_LOCK_TTL_MS: z.coerce.number().int().positive().default(5000),
  IDEMPOTENCY_TTL: z.coerce.number().int().positive().default(86_400),
  // Assina o conteúdo do QR do ingresso (ADR 0004). Trocá-lo invalida os
  // ingressos já emitidos, porque a assinatura deixa de conferir
  TICKET_SECRET: z.string().min(32, "precisa de ao menos 32 caracteres"),
  // Base dos links de compartilhamento de ingresso
  APP_BASE_URL: z.url().default("http://localhost:3000"),
  // Origens do frontend, separadas por vírgula. Não aceita curinga: a API é
  // chamada com Authorization, e responder `*` a requisição autenticada é o
  // tipo de configuração que passa em desenvolvimento e vira problema depois
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173,http://localhost:3001"),
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
