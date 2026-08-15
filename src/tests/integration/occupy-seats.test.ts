import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { seatLabelsFor } from "../../modules/events/events.repository.js";
import { occupySeats } from "../../scripts/occupy-seats.js";
import { createTestPrismaClient, truncateAll } from "../helpers/database.js";

const CAPACITY = 20;
const EXTERNAL_ID = "603";
const EVENT_DATE = new Date("2027-05-10T21:00:00.000Z");

/**
 * Cenário mínimo do que o script precisa: dois clientes e um evento publicado
 * com mapa de assentos. Montado à mão, e não pelo seed, para o teste não ficar
 * preso aos 100 eventos que o seed exige.
 *
 * `externalId` e data são fixos de propósito — é deles que sai a semente do
 * sorteio, e o teste de reprodutibilidade depende disso.
 */
async function createScenario(prisma: PrismaClient): Promise<string> {
  const organizer = await prisma.user.create({
    data: {
      name: "Olívia Organizadora",
      email: "organizador@occupy.test",
      passwordHash: "scrypt$x",
      role: "ORGANIZER",
    },
  });

  await prisma.user.createMany({
    data: [1, 2].map((numero) => ({
      name: `Cliente ${String(numero)}`,
      email: `cliente${String(numero)}@occupy.test`,
      passwordHash: "scrypt$x",
      role: "CUSTOMER" as const,
    })),
  });

  const event = await prisma.event.create({
    data: {
      organizerId: organizer.id,
      sourceType: "MOVIE",
      externalId: EXTERNAL_ID,
      title: "Matrix",
      date: EVENT_DATE,
      venue: "Cine Arena",
      capacity: CAPACITY,
      price: 40,
      status: "PUBLISHED",
    },
  });

  await prisma.seat.createMany({
    data: seatLabelsFor(CAPACITY).map((label) => ({
      eventId: event.id,
      label,
    })),
  });

  return event.id;
}

async function occupiedLabels(
  prisma: PrismaClient,
  eventId: string,
): Promise<string[]> {
  const reservations = await prisma.reservation.findMany({
    where: { eventId },
    select: { seat: { select: { label: true } } },
  });

  return reservations.map((item) => item.seat.label).sort();
}

describe("ocupação do mapa de assentos", () => {
  let prisma: PrismaClient;
  let eventId: string;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    await truncateAll(prisma);
    eventId = await createScenario(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("ocupa a fração pedida dos assentos", async () => {
    const report = await occupySeats(prisma, { rate: 0.5, eventId });

    expect(report.confirmed + report.pending).toBe(CAPACITY / 2);
    expect(report.events).toBe(1);

    const ativas = await prisma.reservation.count({
      where: { eventId, status: { in: ["PENDING", "CONFIRMED"] } },
    });
    expect(ativas).toBe(CAPACITY / 2);
  });

  it("emite ingresso válido para cada reserva confirmada", async () => {
    const confirmadas = await prisma.reservation.findMany({
      where: { eventId, status: "CONFIRMED" },
      include: { ticket: true, payment: true },
    });

    expect(confirmadas.length).toBeGreaterThan(0);
    for (const reservation of confirmadas) {
      expect(reservation.ticket?.status).toBe("VALID");
      expect(reservation.payment?.status).toBe("APPROVED");
    }
  });

  it("deixa parte das reservas pendente de pagamento", async () => {
    const pendentes = await prisma.reservation.findMany({
      where: { eventId, status: "PENDING" },
      include: { payment: true },
    });

    expect(pendentes.length).toBeGreaterThan(0);
    for (const reservation of pendentes) {
      expect(reservation.payment).toBeNull();
      expect(reservation.expiresAt.getTime()).toBeGreaterThan(Date.now());
    }
  });

  it("deixa livres exatamente os assentos que não ocupou", async () => {
    const livres = await prisma.seat.count({
      where: {
        eventId,
        reservations: { none: { status: { in: ["PENDING", "CONFIRMED"] } } },
      },
    });

    expect(livres).toBe(CAPACITY / 2);
  });

  it("rodar de novo com a mesma taxa não ocupa mais nada", async () => {
    const antes = await prisma.reservation.count({ where: { eventId } });
    const report = await occupySeats(prisma, { rate: 0.5, eventId });

    expect(report.confirmed + report.pending).toBe(0);
    await expect(prisma.reservation.count({ where: { eventId } })).resolves.toBe(
      antes,
    );
  });

  it("completa até a nova taxa quando ela sobe", async () => {
    await occupySeats(prisma, { rate: 0.75, eventId });

    const ativas = await prisma.reservation.count({
      where: { eventId, status: { in: ["PENDING", "CONFIRMED"] } },
    });
    expect(ativas).toBe(CAPACITY * 0.75);
  });

  // Vale por si: é o que permite tirar um print do mapa hoje e reproduzi-lo
  // depois de recriar a base.
  it("escolhe os mesmos assentos em bases equivalentes", async () => {
    await truncateAll(prisma);
    const primeiro = await createScenario(prisma);
    await occupySeats(prisma, { rate: 0.5, eventId: primeiro });
    const esperado = await occupiedLabels(prisma, primeiro);

    await truncateAll(prisma);
    const segundo = await createScenario(prisma);
    await occupySeats(prisma, { rate: 0.5, eventId: segundo });

    expect(primeiro).not.toBe(segundo);
    await expect(occupiedLabels(prisma, segundo)).resolves.toEqual(esperado);
  });
});
