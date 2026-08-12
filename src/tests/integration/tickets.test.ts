import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { issueAccessToken } from "../../modules/auth/token.service.js";
import { createPaymentsRepository } from "../../modules/payments/payments.repository.js";
import { createPaymentsService } from "../../modules/payments/payments.service.js";
import { createReservationsRepository } from "../../modules/reservations/reservations.repository.js";
import { createReservationsService } from "../../modules/reservations/reservations.service.js";
import { verifyQrContent } from "../../modules/tickets/qrcode.service.js";
import { createTicketsRepository } from "../../modules/tickets/tickets.repository.js";
import { createTicketsRouter } from "../../modules/tickets/tickets.routes.js";
import { createTicketsService } from "../../modules/tickets/tickets.service.js";
import { errorHandler } from "../../shared/middlewares/error-handler.js";
import { notFoundHandler } from "../../shared/middlewares/not-found.js";
import { requestId } from "../../shared/middlewares/request-id.js";
import { disconnectRedis } from "../../shared/lib/redis.js";
import { createTestPrismaClient, truncateAll } from "../helpers/database.js";

let prisma: PrismaClient;
let app: express.Express;
let eventId: string;
let seats: string[];
let cliente: string;
let outroCliente: string;

async function bearer(userId: string, role: "CUSTOMER" | "ORGANIZER" = "CUSTOMER") {
  const { token } = await issueAccessToken({ userId, role });

  return `Bearer ${token}`;
}

/** Reserva e paga, que é o único caminho que emite ingresso. */
async function comprar(customerId: string, seatId: string, aprovar = true) {
  const reservations = createReservationsService(
    createReservationsRepository(prisma),
  );
  const payments = createPaymentsService(
    createPaymentsRepository(prisma),
    createReservationsRepository(prisma),
  );

  const reserva = await reservations.reserve(customerId, eventId, seatId);
  await payments.pay(customerId, reserva.id, {
    paymentMethod: "PIX",
    simulate: aprovar ? "APPROVED" : "REFUSED",
  });

  return reserva;
}

beforeAll(() => {
  prisma = createTestPrismaClient();

  app = express();
  app.use(requestId);
  app.use(express.json());
  app.use(createTicketsRouter(createTicketsService(createTicketsRepository(prisma))));
  app.use(notFoundHandler);
  app.use(errorHandler);
});

afterAll(async () => {
  await prisma.$disconnect();
  await disconnectRedis();
});

beforeEach(async () => {
  await truncateAll(prisma);

  const organizador = await prisma.user.create({
    data: {
      name: "Olívia",
      email: "org@example.com",
      passwordHash: "scrypt$hash",
      role: "ORGANIZER",
    },
  });
  const primeiro = await prisma.user.create({
    data: {
      name: "Caio",
      email: "caio@example.com",
      passwordHash: "scrypt$hash",
      role: "CUSTOMER",
    },
  });
  const segundo = await prisma.user.create({
    data: {
      name: "Clara",
      email: "clara@example.com",
      passwordHash: "scrypt$hash",
      role: "CUSTOMER",
    },
  });
  cliente = primeiro.id;
  outroCliente = segundo.id;

  const event = await prisma.event.create({
    data: {
      organizerId: organizador.id,
      sourceType: "SHOW",
      externalId: "ext-1",
      title: "Show da Banda",
      date: new Date("2026-12-01T21:00:00Z"),
      venue: "Arena",
      capacity: 2,
      price: 100,
      status: "PUBLISHED",
    },
  });
  eventId = event.id;

  await prisma.seat.createMany({
    data: [
      { eventId: event.id, label: "A1" },
      { eventId: event.id, label: "A2" },
    ],
  });
  const criados = await prisma.seat.findMany({
    where: { eventId: event.id },
    orderBy: { label: "asc" },
  });
  seats = criados.map((seat) => seat.id);
});

describe("emissão", () => {
  it("emite o ingresso quando o pagamento é aprovado", async () => {
    await comprar(cliente, seats[0] ?? "");

    const ticket = await prisma.ticket.findFirstOrThrow();
    expect(ticket.status).toBe("VALID");
    expect(ticket.code).toMatch(/^TKT-/);
    expect(ticket.qrSignature).toBeTruthy();
  });

  it("não emite ingresso quando o pagamento é recusado", async () => {
    await comprar(cliente, seats[0] ?? "", false);

    await expect(prisma.ticket.count()).resolves.toBe(0);
  });

  it("emite códigos diferentes para ingressos diferentes", async () => {
    await comprar(cliente, seats[0] ?? "");
    await comprar(outroCliente, seats[1] ?? "");

    const tickets = await prisma.ticket.findMany();
    expect(new Set(tickets.map((ticket) => ticket.code)).size).toBe(2);
  });
});

describe("GET /tickets/mine", () => {
  it("traz o ingresso com QR verificável e link de compartilhamento", async () => {
    await comprar(cliente, seats[0] ?? "");

    const response = await request(app)
      .get("/tickets/mine")
      .set("authorization", await bearer(cliente));

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);

    const ticket = response.body.items[0] as {
      qrContent: string;
      shareUrl: string;
      code: string;
      seatLabel: string;
      event: { title: string };
    };

    expect(ticket.seatLabel).toBe("A1");
    expect(ticket.event.title).toBe("Show da Banda");
    expect(ticket.shareUrl).toContain(ticket.code);

    // O QR entregue ao cliente confere de verdade
    expect(verifyQrContent(ticket.qrContent)).toMatchObject({
      eventId,
      code: ticket.code,
    });
  });

  it("não mostra ingresso de outro cliente", async () => {
    await comprar(cliente, seats[0] ?? "");
    await comprar(outroCliente, seats[1] ?? "");

    const response = await request(app)
      .get("/tickets/mine")
      .set("authorization", await bearer(outroCliente));

    expect(response.body.total).toBe(1);
    expect(response.body.items[0].seatLabel).toBe("A2");
  });

  it("recusa sem autenticação e recusa organizador", async () => {
    const semToken = await request(app).get("/tickets/mine");
    const organizador = await prisma.user.findFirstOrThrow({
      where: { role: "ORGANIZER" },
    });
    const comoOrganizador = await request(app)
      .get("/tickets/mine")
      .set("authorization", await bearer(organizador.id, "ORGANIZER"));

    expect(semToken.status).toBe(401);
    expect(comoOrganizador.status).toBe(403);
  });
});

describe("GET /tickets/:code", () => {
  it("entrega o ingresso pelo código, sem autenticação", async () => {
    await comprar(cliente, seats[0] ?? "");
    const ticket = await prisma.ticket.findFirstOrThrow();

    const response = await request(app).get(`/tickets/${ticket.code}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      code: ticket.code,
      status: "VALID",
      seatLabel: "A1",
    });
  });

  it("não expõe dados pessoais de quem comprou", async () => {
    await comprar(cliente, seats[0] ?? "");
    const ticket = await prisma.ticket.findFirstOrThrow();

    const response = await request(app).get(`/tickets/${ticket.code}`);
    const corpo = JSON.stringify(response.body);

    expect(corpo).not.toContain("caio@example.com");
    expect(corpo).not.toContain("Caio");
    expect(response.body).not.toHaveProperty("customerId");
  });

  it("responde 404 para código inexistente", async () => {
    const response = await request(app).get("/tickets/TKT-XXXX-XXXX-XXXX");

    expect(response.status).toBe(404);
  });
});
