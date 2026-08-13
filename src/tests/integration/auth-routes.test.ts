import express, { type RequestHandler } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createAuthRouter } from "../../modules/auth/auth.routes.js";
import { createAuthService } from "../../modules/auth/auth.service.js";
import { errorHandler } from "../../shared/middlewares/error-handler.js";
import { notFoundHandler } from "../../shared/middlewares/not-found.js";
import { requestId } from "../../shared/middlewares/request-id.js";
import { createFakeAuthRepository } from "../helpers/fake-auth-repository.js";

const registration = {
  name: "Pessoa Cliente",
  email: "pessoa@example.com",
  password: "senha-de-teste-123",
};

let app: express.Express;

beforeEach(() => {
  app = express();
  app.use(requestId);
  app.use(express.json());
  // Sem limitador: este arquivo exercita a regra de autenticação, e cadastra
  // várias contas do mesmo IP em sequência. O limitador tem teste próprio.
  const semLimite: RequestHandler = (_request, _response, next) => {
    next();
  };
  app.use(
    createAuthRouter(createAuthService(createFakeAuthRepository()), {
      loginLimiter: semLimite,
      registerLimiter: semLimite,
    }),
  );
  app.use(notFoundHandler);
  app.use(errorHandler);
});

async function registerCustomer() {
  const response = await request(app).post("/auth/register").send(registration);

  return response.body as {
    user: { id: string; role: string };
    session: { accessToken: string; refreshToken: string };
  };
}

describe("POST /auth/register", () => {
  it("cria a conta e devolve usuário e sessão", async () => {
    const response = await request(app)
      .post("/auth/register")
      .send(registration);

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({
      email: registration.email,
      role: "CUSTOMER",
    });
    expect(response.body.session.accessToken).toBeTruthy();
    expect(response.body.session.expiresIn).toBeGreaterThan(0);
  });

  it("ignora o papel pedido no corpo", async () => {
    const response = await request(app)
      .post("/auth/register")
      .send({ ...registration, role: "GATE" });

    expect(response.body.user.role).toBe("CUSTOMER");
  });

  it("nunca devolve senha nem hash", async () => {
    const response = await request(app)
      .post("/auth/register")
      .send(registration);

    const corpo = JSON.stringify(response.body);
    expect(corpo).not.toContain(registration.password);
    expect(corpo).not.toContain("passwordHash");
  });

  it("recusa e-mail repetido com 409", async () => {
    await registerCustomer();

    const response = await request(app)
      .post("/auth/register")
      .send(registration);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("CONFLICT");
  });

  it("recusa corpo inválido com 400 e os campos", async () => {
    const response = await request(app)
      .post("/auth/register")
      .send({ name: "x", email: "não-é-email", password: "curta" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    const paths = (response.body.error.details as { path: string }[]).map(
      (detail) => detail.path,
    );
    expect(paths).toEqual(expect.arrayContaining(["name", "email", "password"]));
  });
});

describe("POST /auth/login", () => {
  it("autentica e devolve a sessão", async () => {
    await registerCustomer();

    const response = await request(app)
      .post("/auth/login")
      .send({ email: registration.email, password: registration.password });

    expect(response.status).toBe(200);
    expect(response.body.session.refreshToken).toBeTruthy();
  });

  it("responde 401 igual para senha errada e conta inexistente", async () => {
    await registerCustomer();

    const senhaErrada = await request(app)
      .post("/auth/login")
      .send({ email: registration.email, password: "errada-mesmo" });
    const semConta = await request(app)
      .post("/auth/login")
      .send({ email: "ninguem@example.com", password: "qualquer-coisa" });

    expect(senhaErrada.status).toBe(401);
    expect(semConta.status).toBe(401);
    expect(semConta.body.error.code).toBe(senhaErrada.body.error.code);
    expect(semConta.body.error.message).toBe(senhaErrada.body.error.message);
  });
});

describe("GET /auth/me", () => {
  it("devolve o perfil de quem apresenta o token", async () => {
    const { user, session } = await registerCustomer();

    const response = await request(app)
      .get("/auth/me")
      .set("authorization", `Bearer ${session.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: user.id, role: "CUSTOMER" });
  });

  it("responde 401 sem token", async () => {
    const response = await request(app).get("/auth/me");

    expect(response.status).toBe(401);
  });
});

describe("POST /auth/refresh", () => {
  it("troca o par e invalida o anterior", async () => {
    const { session } = await registerCustomer();

    const renovada = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: session.refreshToken });

    expect(renovada.status).toBe(200);
    expect(renovada.body.refreshToken).not.toBe(session.refreshToken);

    const reuso = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: session.refreshToken });

    expect(reuso.status).toBe(401);
  });

  it("derruba as demais sessões quando um token revogado reaparece", async () => {
    const { session: primeira } = await registerCustomer();
    const login = await request(app)
      .post("/auth/login")
      .send({ email: registration.email, password: registration.password });
    const segunda = login.body.session as { refreshToken: string };

    await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: primeira.refreshToken });
    await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: primeira.refreshToken });

    const outraSessao = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: segunda.refreshToken });

    expect(outraSessao.status).toBe(401);
  });

  it("recusa token desconhecido com 401", async () => {
    const response = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: "token-que-nunca-existiu" });

    expect(response.status).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  it("encerra a sessão apresentada", async () => {
    const { session } = await registerCustomer();

    const logout = await request(app)
      .post("/auth/logout")
      .set("authorization", `Bearer ${session.accessToken}`)
      .send({ refreshToken: session.refreshToken });

    expect(logout.status).toBe(204);

    const renovar = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: session.refreshToken });

    expect(renovar.status).toBe(401);
  });

  it("exige autenticação", async () => {
    const { session } = await registerCustomer();

    const response = await request(app)
      .post("/auth/logout")
      .send({ refreshToken: session.refreshToken });

    expect(response.status).toBe(401);
  });
});
