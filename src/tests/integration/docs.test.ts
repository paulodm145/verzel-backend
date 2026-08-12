import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createApp } from "../../app.js";
import { buildOpenApiDocument, schemaRegistry } from "../../docs/swagger.js";

describe("documentação OpenAPI", () => {
  const app = createApp();

  it("serve um documento OpenAPI 3.0 em /docs.json", async () => {
    const response = await request(app).get("/docs.json");

    expect(response.status).toBe(200);
    expect(response.body.openapi).toMatch(/^3\.0/);
    expect(response.body.info.title).toBeTruthy();
  });

  it("documenta o endpoint de saúde", async () => {
    const response = await request(app).get("/docs.json");

    expect(response.body.paths).toHaveProperty("/health");
    expect(response.body.paths["/health"].get.responses).toHaveProperty("200");
  });

  it("serve a interface do Swagger em /docs", async () => {
    const response = await request(app).get("/docs/");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/html/);
  });

  it("converte todo schema do registro sem lançar", () => {
    expect(() => buildOpenApiDocument()).not.toThrow();
    expect(Object.keys(schemaRegistry).length).toBeGreaterThan(0);
  });

  it("expõe cada schema registrado em components.schemas", async () => {
    const response = await request(app).get("/docs.json");

    for (const name of Object.keys(schemaRegistry)) {
      expect(response.body.components.schemas).toHaveProperty(name);
    }
  });

  it("documenta schema de entrada como entrada, não como saída", () => {
    // Campo com default é opcional para quem envia. Documentado como saída, o
    // documento diria que o cliente é obrigado a mandá-lo.
    schemaRegistry.Paginacao = {
      schema: z.object({ take: z.number().default(20) }),
      io: "input",
    };

    try {
      const document = buildOpenApiDocument();
      const schemas = (document.components as { schemas: Record<string, { required?: string[] }> })
        .schemas;

      expect(schemas.Paginacao?.required ?? []).not.toContain("take");
    } finally {
      delete schemaRegistry.Paginacao;
    }
  });

  it("descreve o envelope de erro compartilhado", async () => {
    const response = await request(app).get("/docs.json");

    expect(response.body.components.schemas).toHaveProperty("ErrorResponse");
  });

  it("documenta as cinco rotas de autenticação", async () => {
    const response = await request(app).get("/docs.json");

    for (const path of [
      "/auth/register",
      "/auth/login",
      "/auth/refresh",
      "/auth/logout",
      "/auth/me",
    ]) {
      expect(response.body.paths).toHaveProperty(path);
    }
  });

  it("declara o esquema Bearer e o exige nas rotas autenticadas", async () => {
    const response = await request(app).get("/docs.json");

    expect(response.body.components.securitySchemes.bearerAuth).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
    expect(response.body.paths["/auth/me"].get.security).toEqual([
      { bearerAuth: [] },
    ]);
    expect(response.body.paths["/auth/login"].post.security).toBeUndefined();
  });

  it("traz exemplo de login para os três papéis", async () => {
    const response = await request(app).get("/docs.json");

    const examples = response.body.paths["/auth/login"].post.requestBody
      .content["application/json"].examples as Record<string, unknown>;

    expect(Object.keys(examples)).toEqual(
      expect.arrayContaining(["organizador", "cliente", "portaria"]),
    );
  });

  it("documenta as rotas de catálogo e de evento", async () => {
    const response = await request(app).get("/docs.json");

    for (const path of [
      "/catalog/search",
      "/events",
      "/events/mine",
      "/events/{id}",
      "/events/{id}/publish",
      "/events/{id}/cancel",
    ]) {
      expect(response.body.paths).toHaveProperty(path);
    }
  });

  it("marca a listagem pública de eventos como aberta e a criação como autenticada", async () => {
    const response = await request(app).get("/docs.json");

    expect(response.body.paths["/events"].get.security).toBeUndefined();
    expect(response.body.paths["/events"].post.security).toEqual([
      { bearerAuth: [] },
    ]);
  });

  it("documenta as rotas de ingresso", async () => {
    const response = await request(app).get("/docs.json");

    expect(response.body.paths).toHaveProperty("/tickets/mine");
    expect(response.body.paths).toHaveProperty("/tickets/{code}");
    expect(response.body.paths["/tickets/{code}"].get.security).toBeUndefined();
  });

  it("documenta as rotas de portaria", async () => {
    const response = await request(app).get("/docs.json");

    expect(response.body.paths).toHaveProperty("/gate/validate");
    expect(response.body.paths).toHaveProperty("/gate/tickets/{code}");
    expect(response.body.paths["/gate/validate"].post.security).toEqual([
      { bearerAuth: [] },
    ]);
  });

  it("documenta o corpo do cadastro sem o campo de papel", async () => {
    const response = await request(app).get("/docs.json");

    const properties = response.body.components.schemas.RegisterRequest
      .properties as Record<string, unknown>;

    expect(Object.keys(properties)).toEqual([
      "name",
      "email",
      "password",
    ]);
  });
});
