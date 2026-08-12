import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../app.js";

describe("aplicação", () => {
  const app = createApp();

  it("responde 404 padronizado para rota inexistente", async () => {
    const response = await request(app).get("/nada-aqui");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("ROUTE_NOT_FOUND");
  });

  it("devolve o cabeçalho de correlação em toda resposta", async () => {
    const response = await request(app).get("/nada-aqui");

    expect(response.headers["x-request-id"]).toBeTruthy();
  });

  it("não anuncia a tecnologia do servidor", async () => {
    const response = await request(app).get("/nada-aqui");

    expect(response.headers).not.toHaveProperty("x-powered-by");
  });

  it("recusa corpo JSON acima do limite configurado", async () => {
    const response = await request(app)
      .post("/nada-aqui")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ campo: "x".repeat(200_000) }));

    expect(response.status).toBe(413);
  });
});
