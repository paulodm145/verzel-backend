import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createCatalogRouter } from "../../modules/catalog/catalog.routes.js";
import type { CatalogService } from "../../modules/catalog/catalog.service.js";
import { createEventsRouter } from "../../modules/events/events.routes.js";
import { createEventsService } from "../../modules/events/events.service.js";
import { issueAccessToken } from "../../modules/auth/token.service.js";
import { errorHandler } from "../../shared/middlewares/error-handler.js";
import { notFoundHandler } from "../../shared/middlewares/not-found.js";
import { requestId } from "../../shared/middlewares/request-id.js";
import { createFakeEventsRepository } from "../helpers/fake-events-repository.js";

const organizador = "11111111-1111-1111-1111-111111111111";
const outroOrganizador = "22222222-2222-2222-2222-222222222222";
const cliente = "33333333-3333-3333-3333-333333333333";

const novoEvento = {
  externalId: "550",
  sourceType: "MOVIE",
  title: "Clube da Luta",
  date: "2026-11-20T23:00:00.000Z",
  venue: "Cine Arena",
  capacity: 10,
  price: 45.5,
};

const catalogoFalso: CatalogService = {
  search: () =>
    Promise.resolve([
      {
        externalId: "550",
        title: "Clube da Luta",
        sourceType: "MOVIE",
        date: "1999-10-15T00:00:00.000Z",
        imageUrl: null,
        description: null,
        provider: "tmdb",
      },
    ]),
};

let app: express.Express;

beforeEach(() => {
  app = express();
  app.use(requestId);
  app.use(express.json());
  app.use(createCatalogRouter(catalogoFalso));
  app.use(createEventsRouter(createEventsService(createFakeEventsRepository())));
  app.use(notFoundHandler);
  app.use(errorHandler);
});

async function tokenDe(userId: string, role: "ORGANIZER" | "CUSTOMER") {
  const { token } = await issueAccessToken({ userId, role });

  return `Bearer ${token}`;
}

/** O corpo da resposta do supertest é `any`; tipar aqui evita espalhar casts. */
function idOf(response: { body: unknown }): string {
  return (response.body as { id: string }).id;
}

async function criarEvento(overrides: Record<string, unknown> = {}) {
  return request(app)
    .post("/events")
    .set("authorization", await tokenDe(organizador, "ORGANIZER"))
    .send({ ...novoEvento, ...overrides });
}

describe("GET /catalog/search", () => {
  it("responde 401 sem token", async () => {
    const response = await request(app).get("/catalog/search?query=clube");

    expect(response.status).toBe(401);
  });

  it("responde 403 para cliente", async () => {
    const response = await request(app)
      .get("/catalog/search?query=clube")
      .set("authorization", await tokenDe(cliente, "CUSTOMER"));

    expect(response.status).toBe(403);
  });

  it("devolve itens normalizados ao organizador", async () => {
    const response = await request(app)
      .get("/catalog/search?query=clube")
      .set("authorization", await tokenDe(organizador, "ORGANIZER"));

    expect(response.status).toBe(200);
    expect(response.body.items[0]).toMatchObject({
      externalId: "550",
      sourceType: "MOVIE",
    });
  });

  it("recusa busca curta demais", async () => {
    const response = await request(app)
      .get("/catalog/search?query=a")
      .set("authorization", await tokenDe(organizador, "ORGANIZER"));

    expect(response.status).toBe(400);
  });
});

describe("POST /events", () => {
  it("cria o evento como rascunho do organizador autenticado", async () => {
    const response = await criarEvento();

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: "DRAFT",
      organizerId: organizador,
      capacity: 10,
    });
  });

  it("recusa cliente", async () => {
    const response = await request(app)
      .post("/events")
      .set("authorization", await tokenDe(cliente, "CUSTOMER"))
      .send(novoEvento);

    expect(response.status).toBe(403);
  });

  it("recusa capacidade acima do teto", async () => {
    const response = await criarEvento({ capacity: 5000 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("ciclo de vida do evento", () => {
  it("publica e o evento passa a aparecer na listagem pública", async () => {
    const criado = await criarEvento();

    const antes = await request(app).get("/events");
    expect(antes.body.total).toBe(0);

    const publicado = await request(app)
      .post(`/events/${idOf(criado)}/publish`)
      .set("authorization", await tokenDe(organizador, "ORGANIZER"));
    expect(publicado.body.status).toBe("PUBLISHED");

    const depois = await request(app).get("/events");
    expect(depois.body.total).toBe(1);
  });

  it("recusa edição por outro organizador", async () => {
    const criado = await criarEvento();

    const response = await request(app)
      .patch(`/events/${idOf(criado)}`)
      .set("authorization", await tokenDe(outroOrganizador, "ORGANIZER"))
      .send({ title: "Sequestrado" });

    expect(response.status).toBe(403);
  });

  it("recusa mudar capacidade depois de publicar", async () => {
    const criado = await criarEvento();
    await request(app)
      .post(`/events/${idOf(criado)}/publish`)
      .set("authorization", await tokenDe(organizador, "ORGANIZER"));

    const response = await request(app)
      .patch(`/events/${idOf(criado)}`)
      .set("authorization", await tokenDe(organizador, "ORGANIZER"))
      .send({ capacity: 50 });

    expect(response.status).toBe(409);
  });

  it("mantém capacidade e mapa em sincronia ao editar rascunho", async () => {
    const criado = await criarEvento();

    const atualizado = await request(app)
      .patch(`/events/${idOf(criado)}`)
      .set("authorization", await tokenDe(organizador, "ORGANIZER"))
      .send({ capacity: 25 });

    expect(atualizado.body.capacity).toBe(25);

    await request(app)
      .post(`/events/${idOf(criado)}/publish`)
      .set("authorization", await tokenDe(organizador, "ORGANIZER"));
    const mapa = await request(app).get(`/events/${idOf(criado)}/seats`);

    expect(mapa.body.total).toBe(25);
  });

  it("recusa publicar evento cancelado", async () => {
    const criado = await criarEvento();
    await request(app)
      .post(`/events/${idOf(criado)}/cancel`)
      .set("authorization", await tokenDe(organizador, "ORGANIZER"));

    const response = await request(app)
      .post(`/events/${idOf(criado)}/publish`)
      .set("authorization", await tokenDe(organizador, "ORGANIZER"));

    expect(response.status).toBe(409);
  });
});

describe("GET /events/mine", () => {
  it("mostra rascunhos do dono e esconde os alheios", async () => {
    await criarEvento();
    await request(app)
      .post("/events")
      .set("authorization", await tokenDe(outroOrganizador, "ORGANIZER"))
      .send({ ...novoEvento, externalId: "551" });

    const response = await request(app)
      .get("/events/mine")
      .set("authorization", await tokenDe(organizador, "ORGANIZER"));

    expect(response.body.total).toBe(1);
    expect(response.body.items[0].organizerId).toBe(organizador);
  });

  it("não é confundida com o detalhe de um evento", async () => {
    const response = await request(app)
      .get("/events/mine")
      .set("authorization", await tokenDe(organizador, "ORGANIZER"));

    expect(response.status).toBe(200);
  });
});

describe("rotas públicas", () => {
  async function publicar(overrides: Record<string, unknown> = {}) {
    const criado = await criarEvento(overrides);
    await request(app)
      .post(`/events/${idOf(criado)}/publish`)
      .set("authorization", await tokenDe(organizador, "ORGANIZER"));

    return criado.body as { id: string };
  }

  it("lista sem autenticação, paginando", async () => {
    await publicar();
    await publicar({ externalId: "551", title: "Matrix" });

    const response = await request(app).get("/events?skip=0&take=1");

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body).toMatchObject({ total: 2, skip: 0, take: 1 });
  });

  it("trata busca vazia como ausência de filtro", async () => {
    await publicar();
    await publicar({ externalId: "551", title: "Matrix" });

    // É o que um campo de texto manda quando o usuário limpa o que digitou
    const response = await request(app).get("/events?search=&skip=0&take=20");

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);
  });

  it("filtra por termo de busca", async () => {
    await publicar();
    await publicar({ externalId: "551", title: "Matrix" });

    const response = await request(app).get("/events?search=matrix");

    const titulos = (response.body as { items: { title: string }[] }).items.map(
      (item) => item.title,
    );

    expect(titulos).toEqual(["Matrix"]);
  });

  it("traz a contagem de assentos livres no detalhe", async () => {
    const evento = await publicar();

    const response = await request(app).get(`/events/${evento.id}`);

    expect(response.body).toMatchObject({ availableSeatsCount: 10 });
  });

  it("responde 404 para rascunho alheio", async () => {
    const criado = await criarEvento();

    const response = await request(app).get(`/events/${idOf(criado)}`);

    expect(response.status).toBe(404);
  });

  it("entrega o mapa de assentos com os ids que a reserva exige", async () => {
    const evento = await publicar();

    const response = await request(app).get(`/events/${evento.id}/seats`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ total: 10, availableCount: 10 });
    expect(response.body.items[0]).toMatchObject({
      label: expect.any(String),
      available: true,
    });
    expect(response.body.items[0].id).toBeTruthy();
  });

  it("não entrega o mapa de um rascunho", async () => {
    const criado = await criarEvento();

    const response = await request(app).get(`/events/${idOf(criado)}/seats`);

    expect(response.status).toBe(404);
  });

  it("responde 400 para id que não é uuid", async () => {
    const response = await request(app).get("/events/não-é-uuid");

    expect(response.status).toBe(400);
  });
});
