import express from "express";
import { SignJWT } from "jose";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { issueAccessToken } from "../../modules/auth/token.service.js";
import { authenticate, getAuth } from "../../shared/middlewares/authenticate.js";
import { errorHandler } from "../../shared/middlewares/error-handler.js";
import { requestId } from "../../shared/middlewares/request-id.js";
import { requireRole } from "../../shared/middlewares/require-role.js";

const userId = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function buildApp() {
  const app = express();

  app.use(requestId);
  app.get("/protegida", authenticate, (req, res) => {
    res.json(getAuth(req));
  });
  app.get(
    "/portaria",
    authenticate,
    requireRole("GATE"),
    (_req, res) => {
      res.json({ ok: true });
    },
  );
  app.get(
    "/gestao",
    authenticate,
    requireRole("ORGANIZER", "GATE"),
    (_req, res) => {
      res.json({ ok: true });
    },
  );
  app.use(errorHandler);

  return app;
}

const app = buildApp();

async function bearerOf(role: "CUSTOMER" | "GATE" | "ORGANIZER") {
  const { token } = await issueAccessToken({ userId, role });

  return `Bearer ${token}`;
}

describe("authenticate", () => {
  it("entrega o usuário e o papel ao handler", async () => {
    const response = await request(app)
      .get("/protegida")
      .set("authorization", await bearerOf("CUSTOMER"));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId, role: "CUSTOMER" });
  });

  it("recusa requisição sem cabeçalho", async () => {
    const response = await request(app).get("/protegida");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("recusa cabeçalho sem o esquema Bearer", async () => {
    const { token } = await issueAccessToken({ userId, role: "CUSTOMER" });

    const response = await request(app)
      .get("/protegida")
      .set("authorization", token);

    expect(response.status).toBe(401);
  });

  it("recusa token expirado", async () => {
    const expired = await new SignJWT({ role: "CUSTOMER" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuer("verzel-backend")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET ?? ""));

    const response = await request(app)
      .get("/protegida")
      .set("authorization", `Bearer ${expired}`);

    expect(response.status).toBe(401);
  });

  it("recusa token assinado com outra chave", async () => {
    const alien = await new SignJWT({ role: "GATE" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuer("verzel-backend")
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode("outro-segredo-com-mais-de-32-caracteres"));

    const response = await request(app)
      .get("/protegida")
      .set("authorization", `Bearer ${alien}`);

    expect(response.status).toBe(401);
  });

  it("responde igual para token ausente, expirado e adulterado", async () => {
    const semToken = await request(app).get("/protegida");
    const adulterado = await request(app)
      .get("/protegida")
      .set("authorization", "Bearer não-é-token");

    expect(adulterado.body.error).toMatchObject({
      code: semToken.body.error.code,
      message: semToken.body.error.message,
    });
  });
});

describe("requireRole", () => {
  it("deixa passar o papel exigido", async () => {
    const response = await request(app)
      .get("/portaria")
      .set("authorization", await bearerOf("GATE"));

    expect(response.status).toBe(200);
  });

  it("recusa com 403 quem está autenticado mas não tem o papel", async () => {
    const response = await request(app)
      .get("/portaria")
      .set("authorization", await bearerOf("CUSTOMER"));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("distingue não autenticado de papel insuficiente", async () => {
    const semToken = await request(app).get("/portaria");
    const papelErrado = await request(app)
      .get("/portaria")
      .set("authorization", await bearerOf("CUSTOMER"));

    expect(semToken.status).toBe(401);
    expect(papelErrado.status).toBe(403);
  });

  it("aceita qualquer um dos papéis listados", async () => {
    for (const role of ["ORGANIZER", "GATE"] as const) {
      const response = await request(app)
        .get("/gestao")
        .set("authorization", await bearerOf(role));

      expect(response.status).toBe(200);
    }
  });
});
