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

  it("gera o esquema de entrada, não o de saída, para corpo de requisição", () => {
    // Com `io: "input"`, campo com default é opcional na entrada. Sem a opção,
    // a documentação diria que o cliente é obrigado a enviá-lo.
    const schema = z.object({ take: z.number().default(20) });

    const asInput = z.toJSONSchema(schema, {
      target: "openapi-3.0",
      io: "input",
    });

    expect(asInput.required ?? []).not.toContain("take");
  });

  it("descreve o envelope de erro compartilhado", async () => {
    const response = await request(app).get("/docs.json");

    expect(response.body.components.schemas).toHaveProperty("ErrorResponse");
  });
});
