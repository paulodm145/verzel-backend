import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { issueAccessToken } from "../../modules/auth/token.service.js";
import { createGateRepository } from "../../modules/gate/gate.repository.js";
import { createGateRouter } from "../../modules/gate/gate.routes.js";
import { createGateService } from "../../modules/gate/gate.service.js";
import { createPaymentsRepository } from "../../modules/payments/payments.repository.js";
import { createPaymentsService } from "../../modules/payments/payments.service.js";
import { createReservationsRepository } from "../../modules/reservations/reservations.repository.js";
import { createReservationsService } from "../../modules/reservations/reservations.service.js";
import { buildQrContent } from "../../modules/tickets/qrcode.service.js";
import { errorHandler } from "../../shared/middlewares/error-handler.js";
import { notFoundHandler } from "../../shared/middlewares/not-found.js";
import { requestId } from "../../shared/middlewares/request-id.js";
import { disconnectRedis } from "../../shared/lib/redis.js";
import { createTestPrismaClient, truncateAll } from "../helpers/database.js";

let prisma: PrismaClient;
let app: express.Express;
let eventId: string;
let outroEventoId: string;
let seats: string[];
let cliente: string;
let portaria: string;

async function bearer(userId: string, role: "GATE" | "CUSTOMER" = "GATE") {
  const { token } = await issueAccessToken({ userId, role });

  return `Bearer ${token}`;
}

async function comprarIngresso(seatId: string, evento = eventId) {
  const repository = createReservationsRepository(prisma);
  const reservations = createReservationsService(repository);
  const payments = createPaymentsService(
    createPaymentsRepository(prisma),
    repository,
  );

  const reserva = await reservations.reserve(cliente, evento, seatId);
  await payments.pay(cliente, reserva.id, {
    paymentMethod: "PIX",
    simulate: "APPROVED",
  });

  return prisma.ticket.findFirstOrThrow({
    where: { reservationId: reserva.id },
  });
}

beforeAll(() => {
  prisma = createTestPrismaClient();

  app = express();
  app.use(requestId);
  app.use(express.json());
  app.use(createGateRouter(createGateService(createGateRepository(prisma))));
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
  const comprador = await prisma.user.create({
    data: {
      name: "Caio",
      email: "caio@example.com",
      passwordHash: "scrypt$hash",
      role: "CUSTOMER",
    },
  });
  const gate = await prisma.user.create({
    data: {
      name: "Pedro Portaria",
      email: "portaria@example.com",
      passwordHash: "scrypt$hash",
      role: "GATE",
    },
  });
  cliente = comprador.id;
  portaria = gate.id;

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

  const outro = await prisma.event.create({
    data: {
      organizerId: organizador.id,
      sourceType: "SHOW",
      externalId: "ext-2",
      title: "Outro Show",
      date: new Date("2026-12-10T21:00:00Z"),
      venue: "Teatro",
      capacity: 1,
      price: 80,
      status: "PUBLISHED",
    },
  });
  outroEventoId = outro.id;
  await prisma.seat.create({ data: { eventId: outro.id, label: "Z1" } });

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

async function validar(body: Record<string, unknown>, userId = portaria, role: "GATE" | "CUSTOMER" = "GATE") {
  return request(app)
    .post("/gate/validate")
    .set("authorization", await bearer(userId, role))
    .send(body);
}

describe("POST /gate/validate", () => {
  it("libera a entrada e marca o ingresso como usado", async () => {
    const ticket = await comprarIngresso(seats[0] ?? "");
    const qrContent = buildQrContent({
      ticketId: ticket.id,
      eventId,
      code: ticket.code,
    });

    const response = await validar({ qrContent, eventId });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      result: "VALID",
      ticket: { code: ticket.code, seatLabel: "A1" },
    });

    const depois = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    expect(depois.status).toBe("USED");
    expect(depois.usedAt).not.toBeNull();
    expect(depois.usedByGateUserId).toBe(portaria);
  });

  it("recusa o mesmo ingresso na segunda vez, informando quando entrou", async () => {
    const ticket = await comprarIngresso(seats[0] ?? "");
    await validar({ code: ticket.code, eventId });

    const segunda = await validar({ code: ticket.code, eventId });

    expect(segunda.body).toMatchObject({ result: "ALREADY_USED" });
    expect(segunda.body.usedAt).toBeTruthy();
  });

  it("aceita o código digitado igual ao QR", async () => {
    const ticket = await comprarIngresso(seats[0] ?? "");

    const response = await validar({ code: ticket.code.toLowerCase(), eventId });

    expect(response.body.result).toBe("VALID");
  });

  it("recusa QR com assinatura adulterada", async () => {
    const ticket = await comprarIngresso(seats[0] ?? "");
    const qrContent = buildQrContent({
      ticketId: ticket.id,
      eventId,
      code: ticket.code,
    });
    const [payload] = qrContent.split(".");

    const response = await validar({
      qrContent: `${payload ?? ""}.assinatura-forjada`,
      eventId,
    });

    expect(response.body.result).toBe("INVALID");

    // Forja não pode ter tocado no ingresso legítimo
    await expect(
      prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } }),
    ).resolves.toMatchObject({ status: "VALID" });
  });

  it("recusa código inexistente", async () => {
    const response = await validar({ code: "TKT-ZZZZ-ZZZZ-ZZZZ", eventId });

    expect(response.body.result).toBe("INVALID");
  });

  it("distingue ingresso de outro evento, sem consumi-lo", async () => {
    const assentoDoOutro = await prisma.seat.findFirstOrThrow({
      where: { eventId: outroEventoId },
    });
    const ticket = await comprarIngresso(assentoDoOutro.id, outroEventoId);

    const response = await validar({ code: ticket.code, eventId });

    expect(response.body).toMatchObject({ result: "WRONG_EVENT" });
    expect(response.body.message).toContain("Outro Show");
    await expect(
      prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } }),
    ).resolves.toMatchObject({ status: "VALID" });
  });

  it("recusa ingresso de evento cancelado", async () => {
    const ticket = await comprarIngresso(seats[0] ?? "");
    await prisma.event.update({
      where: { id: eventId },
      data: { status: "CANCELED" },
    });

    const response = await validar({ code: ticket.code, eventId });

    expect(response.body.result).toBe("INVALID");
    expect(response.body.message).toContain("cancelado");
  });

  it("recusa quem não é portaria", async () => {
    const ticket = await comprarIngresso(seats[0] ?? "");

    const response = await validar(
      { code: ticket.code, eventId },
      cliente,
      "CUSTOMER",
    );

    expect(response.status).toBe(403);
  });

  it("recusa corpo sem código e sem QR", async () => {
    const response = await validar({ eventId });

    expect(response.status).toBe(400);
  });

  it("dois portões simultâneos liberam exatamente uma entrada", async () => {
    const ticket = await comprarIngresso(seats[0] ?? "");
    const autorizacao = await bearer(portaria);

    const [primeira, segunda] = await Promise.all([
      request(app)
        .post("/gate/validate")
        .set("authorization", autorizacao)
        .send({ code: ticket.code, eventId }),
      request(app)
        .post("/gate/validate")
        .set("authorization", autorizacao)
        .send({ code: ticket.code, eventId }),
    ]);

    const resultados = [primeira.body.result, segunda.body.result].sort();

    expect(resultados).toEqual(["ALREADY_USED", "VALID"]);
  });
});

describe("GET /gate/tickets/:code", () => {
  it("consulta sem marcar uso", async () => {
    const ticket = await comprarIngresso(seats[0] ?? "");

    const response = await request(app)
      .get(`/gate/tickets/${ticket.code}`)
      .set("authorization", await bearer(portaria));

    expect(response.body.result).toBe("VALID");
    await expect(
      prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } }),
    ).resolves.toMatchObject({ status: "VALID", usedAt: null });
  });

  it("mostra que já foi usado depois da validação", async () => {
    const ticket = await comprarIngresso(seats[0] ?? "");
    await validar({ code: ticket.code, eventId });

    const response = await request(app)
      .get(`/gate/tickets/${ticket.code}`)
      .set("authorization", await bearer(portaria));

    expect(response.body).toMatchObject({ result: "ALREADY_USED" });
    expect(response.body.usedAt).toBeTruthy();
  });

  it("responde 404 para código inexistente", async () => {
    const response = await request(app)
      .get("/gate/tickets/TKT-ZZZZ-ZZZZ-ZZZZ")
      .set("authorization", await bearer(portaria));

    expect(response.status).toBe(404);
  });
});
