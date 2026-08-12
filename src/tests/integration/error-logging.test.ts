import express from "express";
import { pino } from "pino";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createErrorHandler } from "../../shared/middlewares/error-handler.js";
import { requestId } from "../../shared/middlewares/request-id.js";

/**
 * A outra metade do CA-10: o detalhe que **não** vai para o cliente precisa
 * estar no log, sob o mesmo requestId. Sem isto, "não vazar detalhe" seria
 * indistinguível de "perder o detalhe".
 */
function buildAppCapturingLogs() {
  const lines: string[] = [];
  const logger = pino(
    { level: "error" },
    { write: (line: string) => lines.push(line) },
  );

  const app = express();
  app.use(requestId);
  app.get("/explode", () => {
    throw new Error("segredo-do-servidor-42");
  });
  app.use(createErrorHandler(logger));

  return { app, lines };
}

describe("registro de falha inesperada", () => {
  it("registra mensagem, stack e requestId no log", async () => {
    const { app, lines } = buildAppCapturingLogs();

    const response = await request(app).get("/explode");
    const logged = lines.join("\n");

    expect(logged).toMatch(/segredo-do-servidor-42/);
    expect(logged).toMatch(/"stack"/);
    expect(logged).toContain(response.body.error.requestId);
  });

  it("não repete no corpo da resposta o que foi para o log", async () => {
    const { app } = buildAppCapturingLogs();

    const response = await request(app).get("/explode");

    expect(JSON.stringify(response.body)).not.toMatch(/segredo-do-servidor-42/);
  });

  it("não registra nada em nível de erro quando o erro é esperado", async () => {
    const { app, lines } = buildAppCapturingLogs();

    await request(app).get("/rota-inexistente");

    expect(lines).toHaveLength(0);
  });
});
