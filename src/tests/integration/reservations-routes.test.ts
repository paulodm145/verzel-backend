import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { issueAccessToken } from "../../modules/auth/token.service.js";
import { createPaymentsRepository } from "../../modules/payments/payments.repository.js";
import { createPaymentsService } from "../../modules/payments/payments.service.js";
import { createReservationsRepository } from "../../modules/reservations/reservations.repository.js";
import { createReservationsRouter } from "../../modules/reservations/reservations.routes.js";
import { createReservationsService } from "../../modules/reservations/reservations.service.js";
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

beforeAll(() => {
  prisma = createTestPrismaClient();
  const repository = createReservationsRepository(prisma);

  app = express();
  app.use(requestId);
  app.use(express.json());
  app.use(
    createReservationsRouter({
      reservations: createReservationsService(repository),
      payments: createPaymentsService(
        createPaymentsRepository(prisma),
        repository,
      ),
    }),
  );
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
      title: "Show",
      date: new Date("2026-12-01T21:00:00Z"),
      venue: "Arena",
      capacity: 3,
      price: 100,
      status: "PUBLISHED",
    },
  });
  eventId = event.id;

  await prisma.seat.createMany({
    data: [
      { eventId: event.id, label: "A1" },
      { eventId: event.id, label: "A2" },
      { eventId: event.id, label: "A3" },
    ],
  });
  const criados = await prisma.seat.findMany({
    where: { eventId: event.id },
    orderBy: { label: "asc" },
  });
  seats = criados.map((seat) => seat.id);
});

async function reservar(
  seatId: string,
  userId = cliente,
  idempotencyKey?: string,
): Promise<request.Response> {
  const call = request(app)
    .post(`/events/${eventId}/reservations`)
    .set("authorization", await bearer(userId));

  if (idempotencyKey) {
    call.set("idempotency-key", idempotencyKey);
  }

  return call.send({ seatId });
}

describe("POST /events/:id/reservations", () => {
  it("cria a reserva pendente com prazo e rótulo do assento", async () => {
    const response = await reservar(seats[0] ?? "");

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: "PENDING",
      seatLabel: "A1",
      customerId: cliente,
    });
    expect(new Date(response.body.expiresAt as string).getTime()).toBeGreaterThan(
      Date.now(),
    );
  });

  it("recusa o assento já reservado com 409", async () => {
    await reservar(seats[0] ?? "");

    const response = await reservar(seats[0] ?? "", outroCliente);

    expect(response.status).toBe(409);
  });

  it("recusa assento de outro evento com 404", async () => {
    const outroEvento = await prisma.event.create({
      data: {
        organizerId: (await prisma.user.findFirstOrThrow({ where: { role: "ORGANIZER" } })).id,
        sourceType: "SHOW",
        externalId: "ext-2",
        title: "Outro",
        date: new Date("2026-12-05T21:00:00Z"),
        venue: "Outro",
        capacity: 1,
        price: 50,
        status: "PUBLISHED",
      },
    });
    const assentoDeOutro = await prisma.seat.create({
      data: { eventId: outroEvento.id, label: "Z9" },
    });

    const response = await reservar(assentoDeOutro.id);

    expect(response.status).toBe(404);
  });

  it("recusa reserva em evento não publicado com 409", async () => {
    await prisma.event.update({
      where: { id: eventId },
      data: { status: "DRAFT" },
    });

    const response = await reservar(seats[0] ?? "");

    expect(response.status).toBe(409);
  });

  it("recusa organizador — reservar é papel de cliente", async () => {
    const organizador = await prisma.user.findFirstOrThrow({
      where: { role: "ORGANIZER" },
    });

    const response = await request(app)
      .post(`/events/${eventId}/reservations`)
      .set("authorization", await bearer(organizador.id, "ORGANIZER"))
      .send({ seatId: seats[0] });

    expect(response.status).toBe(403);
  });

  it("reproduz a resposta com o mesmo Idempotency-Key, sem criar outra reserva", async () => {
    const chave = `chave-${String(Date.now())}`;

    const primeira = await reservar(seats[0] ?? "", cliente, chave);
    const segunda = await reservar(seats[0] ?? "", cliente, chave);

    expect(primeira.status).toBe(201);
    expect(segunda.status).toBe(201);
    expect(segunda.body.id).toBe(primeira.body.id);
    expect(segunda.headers["idempotency-replayed"]).toBe("true");

    await expect(prisma.reservation.count()).resolves.toBe(1);
  });

  it("sem Idempotency-Key, a segunda tentativa no mesmo assento dá 409", async () => {
    await reservar(seats[0] ?? "");

    const segunda = await reservar(seats[0] ?? "");

    expect(segunda.status).toBe(409);
  });
});

describe("GET /reservations/mine", () => {
  it("mostra as próprias e esconde as de outro cliente", async () => {
    await reservar(seats[0] ?? "");
    await reservar(seats[1] ?? "", outroCliente);

    const response = await request(app)
      .get("/reservations/mine")
      .set("authorization", await bearer(cliente));

    expect(response.body.total).toBe(1);
    expect(response.body.items[0].customerId).toBe(cliente);
  });
});

describe("DELETE /reservations/:id", () => {
  it("cancela a própria reserva e libera o assento", async () => {
    const criada = await reservar(seats[0] ?? "");

    const cancelada = await request(app)
      .delete(`/reservations/${criada.body.id as string}`)
      .set("authorization", await bearer(cliente));

    expect(cancelada.body.status).toBe("CANCELED");

    // O assento volta a ser vendável
    const outra = await reservar(seats[0] ?? "", outroCliente);
    expect(outra.status).toBe(201);
  });

  it("recusa cancelar reserva de outro cliente", async () => {
    const criada = await reservar(seats[0] ?? "");

    const response = await request(app)
      .delete(`/reservations/${criada.body.id as string}`)
      .set("authorization", await bearer(outroCliente));

    expect(response.status).toBe(403);
  });
});

describe("POST /reservations/:id/payment", () => {
  async function pagar(
    reservationId: string,
    body: Record<string, unknown> = {},
    userId = cliente,
    idempotencyKey?: string,
  ) {
    const call = request(app)
      .post(`/reservations/${reservationId}/payment`)
      .set("authorization", await bearer(userId));

    if (idempotencyKey) {
      call.set("idempotency-key", idempotencyKey);
    }

    return call.send(body);
  }

  it("aprova, confirma a reserva e registra o pagamento", async () => {
    const criada = await reservar(seats[0] ?? "");

    const response = await pagar(criada.body.id as string);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "APPROVED",
      reservationStatus: "CONFIRMED",
    });
    await expect(
      prisma.reservation.findUnique({ where: { id: criada.body.id as string } }),
    ).resolves.toMatchObject({ status: "CONFIRMED" });
  });

  it("recusado deixa a reserva pendente, para o cliente tentar de novo", async () => {
    const criada = await reservar(seats[0] ?? "");

    const response = await pagar(criada.body.id as string, {
      simulate: "REFUSED",
    });

    expect(response.body).toMatchObject({
      status: "REFUSED",
      reservationStatus: "PENDING",
    });

    const segundaTentativa = await pagar(criada.body.id as string);
    expect(segundaTentativa.body.status).toBe("APPROVED");
  });

  it("recusa pagar reserva já confirmada", async () => {
    const criada = await reservar(seats[0] ?? "");
    await pagar(criada.body.id as string);

    const response = await pagar(criada.body.id as string);

    expect(response.status).toBe(409);
  });

  it("recusa pagar reserva vencida", async () => {
    const criada = await reservar(seats[0] ?? "");
    await prisma.reservation.update({
      where: { id: criada.body.id as string },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await pagar(criada.body.id as string);

    expect(response.status).toBe(409);
  });

  it("recusa pagar reserva de outro cliente", async () => {
    const criada = await reservar(seats[0] ?? "");

    const response = await pagar(criada.body.id as string, {}, outroCliente);

    expect(response.status).toBe(403);
  });

  it("não cobra duas vezes com o mesmo Idempotency-Key", async () => {
    const criada = await reservar(seats[0] ?? "");
    const chave = `pagamento-${String(Date.now())}`;

    const primeira = await pagar(criada.body.id as string, {}, cliente, chave);
    const segunda = await pagar(criada.body.id as string, {}, cliente, chave);

    expect(primeira.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(segunda.body.id).toBe(primeira.body.id);
    expect(segunda.headers["idempotency-replayed"]).toBe("true");
    await expect(prisma.payment.count()).resolves.toBe(1);
  });
});
