import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { errorHandler } from "../../shared/middlewares/error-handler.js";
import { requestId } from "../../shared/middlewares/request-id.js";
import { validate, validated } from "../../shared/middlewares/validate.js";

const createSchema = z.object({
  email: z.email(),
  name: z.string().min(2),
});

const listSchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(100).default(20),
});

const paramsSchema = z.object({ id: z.uuid() });

function buildApp() {
  const app = express();

  app.use(requestId);
  app.use(express.json());

  app.post("/usuarios", validate({ body: createSchema }), (req, res) => {
    res.json(validated(req, { body: createSchema }).body);
  });

  app.get("/eventos", validate({ query: listSchema }), (req, res) => {
    res.json(validated(req, { query: listSchema }).query);
  });

  app.get("/eventos/:id", validate({ params: paramsSchema }), (req, res) => {
    res.json(validated(req, { params: paramsSchema }).params);
  });

  app.use(errorHandler);

  return app;
}

describe("validação de entrada", () => {
  const app = buildApp();

  it("entrega ao handler o corpo já convertido", async () => {
    const response = await request(app)
      .post("/usuarios")
      .send({ email: "pessoa@example.com", name: "Pessoa" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      email: "pessoa@example.com",
      name: "Pessoa",
    });
  });

  it("remove campos não declarados no schema", async () => {
    const response = await request(app)
      .post("/usuarios")
      .send({ email: "pessoa@example.com", name: "Pessoa", role: "ORGANIZER" });

    expect(response.body).not.toHaveProperty("role");
  });

  it("recusa corpo inválido com 400 e o caminho do campo", async () => {
    const response = await request(app)
      .post("/usuarios")
      .send({ email: "não-é-email", name: "P" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");

    const details = response.body.error.details as { path: string }[];
    const paths = details.map((detail) => detail.path);
    expect(paths).toContain("email");
    expect(paths).toContain("name");
  });

  it("recusa corpo ausente sem quebrar — em Express 5 req.body é undefined", async () => {
    const response = await request(app).post("/usuarios");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("converte a query e aplica os padrões de paginação", async () => {
    const response = await request(app).get("/eventos?skip=10&take=5");

    expect(response.body).toEqual({ skip: 10, take: 5 });
  });

  it("aplica os padrões quando a query vem vazia", async () => {
    const response = await request(app).get("/eventos");

    expect(response.body).toEqual({ skip: 0, take: 20 });
  });

  it("recusa paginação fora dos limites", async () => {
    const response = await request(app).get("/eventos?take=1000");

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].path).toBe("take");
  });

  it("valida params de rota", async () => {
    const response = await request(app).get("/eventos/não-é-uuid");

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].path).toBe("id");
  });

  it("aceita params válidos", async () => {
    const id = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

    const response = await request(app).get(`/eventos/${id}`);

    expect(response.body).toEqual({ id });
  });
});
