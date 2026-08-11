import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/index.js";
import { errorHandler } from "../../shared/middlewares/error-handler.js";
import { notFoundHandler } from "../../shared/middlewares/not-found.js";
import { requestId } from "../../shared/middlewares/request-id.js";

function buildApp() {
  const app = express();

  app.use(requestId);
  app.use(express.json());

  app.get("/nao-encontrado", () => {
    throw new NotFoundError("Evento");
  });

  app.get("/conflito", () => {
    throw new ConflictError("Assento já reservado");
  });

  app.get("/invalido", () => {
    throw new ValidationError("Dados inválidos", [
      { path: "email", message: "E-mail inválido" },
    ]);
  });

  app.get("/explode", () => {
    throw new Error("detalhe interno que não pode vazar");
  });

  app.get("/explode-async", async () => {
    await Promise.resolve();
    throw new Error("detalhe interno assíncrono");
  });

  app.post("/corpo", (req, res) => {
    res.json({ recebido: req.body });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

describe("tratamento centralizado de erros", () => {
  const app = buildApp();

  it("mapeia NotFoundError para 404", async () => {
    const response = await request(app).get("/nao-encontrado");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(response.body.error.message).toMatch(/Evento/);
  });

  it("mapeia ConflictError para 409", async () => {
    const response = await request(app).get("/conflito");

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("CONFLICT");
  });

  it("expõe os detalhes de um erro de validação", async () => {
    const response = await request(app).get("/invalido");

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([
      { path: "email", message: "E-mail inválido" },
    ]);
  });

  it("converte erro inesperado em 500 genérico", async () => {
    const response = await request(app).get("/explode");

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_ERROR");
  });

  it("não vaza mensagem interna nem stack trace no 500", async () => {
    const response = await request(app).get("/explode");
    const serialized = JSON.stringify(response.body);

    expect(serialized).not.toMatch(/detalhe interno/);
    expect(serialized).not.toMatch(/at .*\.ts:/);
    expect(response.body.error.stack).toBeUndefined();
  });

  it("captura rejeição de handler async — Express 5 encaminha sozinho", async () => {
    const response = await request(app).get("/explode-async");

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_ERROR");
  });

  it("devolve o requestId no corpo do 500 e no cabeçalho", async () => {
    const response = await request(app).get("/explode");

    expect(response.body.error.requestId).toBeTruthy();
    expect(response.headers["x-request-id"]).toBe(
      response.body.error.requestId,
    );
  });

  it("trata JSON malformado como erro do cliente, não do servidor", async () => {
    const response = await request(app)
      .post("/corpo")
      .set("Content-Type", "application/json")
      .send("{ isto não é json }");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("MALFORMED_JSON");
  });

  it("responde 404 padronizado para rota inexistente", async () => {
    const response = await request(app).get("/rota-que-nao-existe");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("ROUTE_NOT_FOUND");
  });

  it("mantém o mesmo envelope em todas as respostas de erro", async () => {
    const paths = ["/nao-encontrado", "/conflito", "/explode", "/inexistente"];

    for (const path of paths) {
      const response = await request(app).get(path);

      expect(Object.keys(response.body as object)).toEqual(["error"]);
      expect(response.body.error).toHaveProperty("code");
      expect(response.body.error).toHaveProperty("message");
      expect(response.body.error).toHaveProperty("requestId");
    }
  });
});
