import { z, type ZodType } from "zod";

import { healthReportSchema } from "../modules/health/health.schema.js";

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string().meta({ description: "Código estável do erro" }),
    message: z.string(),
    details: z
      .array(z.object({ path: z.string(), message: z.string() }))
      .optional(),
    requestId: z.string().meta({
      description: "Correlaciona a resposta com a linha de log da falha",
    }),
  }),
});

/**
 * Schemas expostos na documentação. Registrar aqui é o que garante que o
 * documento OpenAPI derive dos mesmos schemas que validam a entrada, em vez de
 * descrever o contrato uma segunda vez (ADR 0007).
 */
export const schemaRegistry: Record<string, ZodType> = {
  ErrorResponse: errorResponseSchema,
  HealthReport: healthReportSchema,
};

function reference(name: string): { $ref: string } {
  return { $ref: `#/components/schemas/${name}` };
}

function jsonContent(name: string): Record<string, unknown> {
  return { "application/json": { schema: reference(name) } };
}

/**
 * O Zod converte schemas; ele não descreve rotas. O esqueleto abaixo — paths,
 * verbos e respostas — é escrito à mão de propósito, e é a parte que pode
 * divergir das rotas reais. Os schemas em si nunca divergem: são os mesmos
 * objetos usados na validação.
 */
export function buildOpenApiDocument(): Record<string, unknown> {
  const schemas = Object.fromEntries(
    Object.entries(schemaRegistry).map(([name, schema]) => [
      name,
      z.toJSONSchema(schema, { target: "openapi-3.0", io: "output" }),
    ]),
  );

  return {
    openapi: "3.0.3",
    info: {
      title: "Plataforma de Eventos e Ingressos",
      version: "0.1.0",
      description:
        "API do desafio Elite Dev 2026. Os endpoints de domínio são " +
        "adicionados conforme os épicos avançam.",
    },
    tags: [{ name: "Saúde", description: "Estado da aplicação" }],
    paths: {
      "/health": {
        get: {
          tags: ["Saúde"],
          summary: "Estado de Postgres e Redis",
          description:
            "Responde 200 mesmo com o Redis fora, marcando degradação: sem " +
            "Redis o sistema perde lock e cache, mas continua correto. " +
            "Responde 503 apenas quando o Postgres está inacessível.",
          responses: {
            "200": {
              description: "Aplicação no ar, íntegra ou degradada",
              content: jsonContent("HealthReport"),
            },
            "503": {
              description: "Postgres inacessível",
              content: jsonContent("HealthReport"),
            },
          },
        },
      },
    },
    components: {
      schemas,
      responses: {
        ValidationError: {
          description: "Entrada inválida",
          content: jsonContent("ErrorResponse"),
        },
        InternalError: {
          description: "Falha inesperada",
          content: jsonContent("ErrorResponse"),
        },
      },
    },
  };
}
