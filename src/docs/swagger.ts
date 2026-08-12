import { z, type ZodType } from "zod";

import {
  loginSchema,
  refreshSchema,
  registerResponseSchema,
  registerSchema,
  sessionSchema,
  userSchema,
} from "../modules/auth/auth.schema.js";
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
 * Um schema Zod tem duas leituras: a de entrada, em que um campo com `.default()`
 * é opcional, e a de saída, em que ele sempre está presente. Documentar corpo de
 * requisição como saída faria a documentação exigir do cliente um campo que o
 * schema preenche sozinho — por isso o registro guarda qual das duas usar.
 */
interface RegisteredSchema {
  readonly schema: ZodType;
  readonly io: "input" | "output";
}

/**
 * Schemas expostos na documentação. Registrar aqui é o que garante que o
 * documento OpenAPI derive dos mesmos schemas que validam a entrada, em vez de
 * descrever o contrato uma segunda vez (ADR 0007).
 */
export const schemaRegistry: Record<string, RegisteredSchema> = {
  ErrorResponse: { schema: errorResponseSchema, io: "output" },
  HealthReport: { schema: healthReportSchema, io: "output" },
  RegisterRequest: { schema: registerSchema, io: "input" },
  LoginRequest: { schema: loginSchema, io: "input" },
  RefreshRequest: { schema: refreshSchema, io: "input" },
  User: { schema: userSchema, io: "output" },
  Session: { schema: sessionSchema, io: "output" },
  AuthenticatedUser: { schema: registerResponseSchema, io: "output" },
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
    Object.entries(schemaRegistry).map(([name, registered]) => [
      name,
      z.toJSONSchema(registered.schema, {
        target: "openapi-3.0",
        io: registered.io,
      }),
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
    tags: [
      { name: "Saúde", description: "Estado da aplicação" },
      { name: "Autenticação", description: "Cadastro, sessão e perfil" },
    ],
    paths: {
      "/auth/register": {
        post: {
          tags: ["Autenticação"],
          summary: "Cadastrar cliente",
          description:
            "Cria uma conta com papel CUSTOMER e já abre a sessão. O campo " +
            "`role` enviado no corpo é ignorado: organizador e portaria só " +
            "existem por seed.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: reference("RegisterRequest"),
                examples: {
                  cliente: {
                    summary: "Cliente novo",
                    value: {
                      name: "Ana Cliente",
                      email: "ana@example.com",
                      password: "senha-de-teste-123",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Conta criada e sessão aberta",
              content: jsonContent("AuthenticatedUser"),
            },
            "400": { $ref: "#/components/responses/ValidationError" },
            "409": {
              description: "E-mail já cadastrado",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/auth/login": {
        post: {
          tags: ["Autenticação"],
          summary: "Autenticar",
          description:
            "E-mail inexistente e senha errada respondem exatamente igual — " +
            "inclusive no tempo de resposta.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: reference("LoginRequest"),
                examples: {
                  organizador: {
                    summary: "Organizador do seed",
                    value: {
                      email: "organizador@verzel.test",
                      password: "organizador123",
                    },
                  },
                  cliente: {
                    summary: "Cliente do seed",
                    value: {
                      email: "cliente1@verzel.test",
                      password: "cliente123",
                    },
                  },
                  portaria: {
                    summary: "Portaria do seed",
                    value: {
                      email: "portaria@verzel.test",
                      password: "portaria123",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Sessão aberta",
              content: jsonContent("AuthenticatedUser"),
            },
            "400": { $ref: "#/components/responses/ValidationError" },
            "401": {
              description: "Credenciais inválidas",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/auth/refresh": {
        post: {
          tags: ["Autenticação"],
          summary: "Renovar a sessão",
          description:
            "Troca o token de renovação por um par novo. O token apresentado " +
            "deixa de valer; reapresentá-lo derruba todas as sessões do " +
            "usuário, porque isso indica roubo (ADR 0010).",
          requestBody: {
            required: true,
            content: { "application/json": { schema: reference("RefreshRequest") } },
          },
          responses: {
            "200": {
              description: "Par de tokens renovado",
              content: jsonContent("Session"),
            },
            "400": { $ref: "#/components/responses/ValidationError" },
            "401": {
              description: "Token desconhecido, expirado ou já usado",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/auth/logout": {
        post: {
          tags: ["Autenticação"],
          summary: "Encerrar a sessão",
          description: "Revoga o token de renovação apresentado. As demais sessões seguem valendo.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: reference("RefreshRequest") } },
          },
          responses: {
            "204": { description: "Sessão encerrada" },
            "401": {
              description: "Sem autenticação",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
      "/auth/me": {
        get: {
          tags: ["Autenticação"],
          summary: "Perfil do usuário autenticado",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Perfil", content: jsonContent("User") },
            "401": {
              description: "Sem autenticação, ou token inválido",
              content: jsonContent("ErrorResponse"),
            },
          },
        },
      },
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
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "Token de acesso devolvido por /auth/login ou /auth/register.",
        },
      },
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
