import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { createTestPrismaClient, truncateAll } from "../helpers/database.js";

/**
 * Prova que a garantia contra dupla venda está **no banco**, não no service:
 * todas as escritas aqui são SQL direto, sem passar por nenhuma regra da
 * aplicação (ADR 0003, critérios CA-3, CA-4 e CA-5).
 */
describe("constraint anti-overselling em Reservation", () => {
  let prisma: PrismaClient;
  const eventId = "11111111-1111-1111-1111-111111111111";
  const seatId = "22222222-2222-2222-2222-222222222222";
  const organizerId = "33333333-3333-3333-3333-333333333333";
  const customerId = "44444444-4444-4444-4444-444444444444";
  const otherCustomerId = "55555555-5555-5555-5555-555555555555";

  beforeAll(() => {
    prisma = createTestPrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);

    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" (id, name, email, "passwordHash", role) VALUES
         ($1, 'Organizador', 'org@example.com', 'hash', 'ORGANIZER'),
         ($2, 'Cliente Um', 'um@example.com', 'hash', 'CUSTOMER'),
         ($3, 'Cliente Dois', 'dois@example.com', 'hash', 'CUSTOMER')`,
      organizerId,
      customerId,
      otherCustomerId,
    );

    await prisma.$executeRawUnsafe(
      `INSERT INTO "Event" (id, "organizerId", "sourceType", "externalId", title, date, venue, capacity, price, status)
       VALUES ($1, $2, 'SHOW', 'ext-1', 'Show', NOW() + INTERVAL '30 days', 'Arena', 100, 150.00, 'PUBLISHED')`,
      eventId,
      organizerId,
    );

    await prisma.$executeRawUnsafe(
      `INSERT INTO "Seat" (id, "eventId", label) VALUES ($1, $2, 'B12')`,
      seatId,
      eventId,
    );
  });

  function insertReservation(
    id: string,
    status: string,
    reservedBy: string,
  ): Promise<number> {
    return prisma.$executeRawUnsafe(
      `INSERT INTO "Reservation" (id, "eventId", "customerId", "seatId", status, "expiresAt")
       VALUES ($1, $2, $3, $4, $5::"ReservationStatus", NOW() + INTERVAL '10 minutes')`,
      id,
      eventId,
      reservedBy,
      seatId,
      status,
    );
  }

  it("declara o índice único parcial restrito aos status ativos", async () => {
    const indexes = await prisma.$queryRawUnsafe<
      { indexdef: string }[]
    >(`SELECT indexdef FROM pg_indexes WHERE tablename = 'Reservation'`);

    const partial = indexes.find(
      (index) =>
        index.indexdef.includes("UNIQUE") && index.indexdef.includes("WHERE"),
    );

    expect(partial).toBeDefined();
    expect(partial?.indexdef).toMatch(/seatId/);
    expect(partial?.indexdef).toMatch(/PENDING/);
    expect(partial?.indexdef).toMatch(/CONFIRMED/);
  });

  it("rejeita uma segunda reserva PENDING para o mesmo assento", async () => {
    await insertReservation("res-1", "PENDING", customerId);

    await expect(
      insertReservation("res-2", "PENDING", otherCustomerId),
    ).rejects.toThrow();
  });

  it("rejeita uma reserva CONFIRMED sobre um assento já com reserva PENDING", async () => {
    await insertReservation("res-1", "PENDING", customerId);

    await expect(
      insertReservation("res-2", "CONFIRMED", otherCustomerId),
    ).rejects.toThrow();
  });

  it("aceita nova reserva quando a anterior está CANCELED", async () => {
    await insertReservation("res-1", "CANCELED", customerId);

    await expect(
      insertReservation("res-2", "PENDING", otherCustomerId),
    ).resolves.toBe(1);
  });

  it("aceita nova reserva quando a anterior está EXPIRED", async () => {
    await insertReservation("res-1", "EXPIRED", customerId);

    await expect(
      insertReservation("res-2", "PENDING", otherCustomerId),
    ).resolves.toBe(1);
  });

  it("permite várias reservas encerradas para o mesmo assento", async () => {
    await insertReservation("res-1", "EXPIRED", customerId);
    await insertReservation("res-2", "CANCELED", otherCustomerId);

    await expect(
      insertReservation("res-3", "EXPIRED", customerId),
    ).resolves.toBe(1);
  });
});
