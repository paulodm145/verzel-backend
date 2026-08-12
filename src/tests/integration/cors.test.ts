import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../app.js";

const app = createApp();
const ORIGEM_PERMITIDA = "http://localhost:5173";

describe("CORS", () => {
  it("libera a origem do frontend", async () => {
    const response = await request(app)
      .get("/events")
      .set("origin", ORIGEM_PERMITIDA);

    expect(response.headers["access-control-allow-origin"]).toBe(
      ORIGEM_PERMITIDA,
    );
    expect(response.headers.vary).toContain("Origin");
  });

  it("responde ao preflight sem exigir autenticação", async () => {
    const response = await request(app)
      .options("/events/3f2504e0-4f89-41d3-9a0c-0305e82c3301/reservations")
      .set("origin", ORIGEM_PERMITIDA)
      .set("access-control-request-method", "POST")
      .set("access-control-request-headers", "authorization, idempotency-key");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-headers"]).toContain(
      "Idempotency-Key",
    );
    expect(response.headers["access-control-allow-methods"]).toContain("POST");
  });

  it("expõe o cabeçalho de idempotência ao JavaScript do navegador", async () => {
    const response = await request(app)
      .get("/events")
      .set("origin", ORIGEM_PERMITIDA);

    expect(response.headers["access-control-expose-headers"]).toContain(
      "Idempotency-Replayed",
    );
  });

  it("não libera origem desconhecida", async () => {
    const response = await request(app)
      .get("/events")
      .set("origin", "https://site-de-outra-pessoa.test");

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("não responde curinga", async () => {
    const response = await request(app)
      .get("/events")
      .set("origin", ORIGEM_PERMITIDA);

    expect(response.headers["access-control-allow-origin"]).not.toBe("*");
  });
});
