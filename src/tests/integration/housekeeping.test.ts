import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { runHousekeeping } from "../../shared/lib/housekeeping.js";
import { createTestPrismaClient, truncateAll } from "../helpers/database.js";

let prisma: PrismaClient;
let eventId: string;
let customerId: string;
let seatId: string;

const HÁ_DEZ_DIAS = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

beforeAll(() => {
  prisma = createTestPrismaClient();
});

afterAll(async () => {
  await prisma.$disconnect();
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
  const cliente = await prisma.user.create({
    data: {
      name: "Caio",
      email: "caio@example.com",
      passwordHash: "scrypt$hash",
      role: "CUSTOMER",
    },
  });
  customerId = cliente.id;

  const event = await prisma.event.create({
    data: {
      organizerId: organizador.id,
      sourceType: "SHOW",
      externalId: "ext-1",
      title: "Show",
      date: new Date("2026-12-01T21:00:00Z"),
      venue: "Arena",
      capacity: 1,
      price: 100,
      status: "PUBLISHED",
    },
  });
  eventId = event.id;

  const seat = await prisma.seat.create({
    data: { eventId: event.id, label: "A1" },
  });
  seatId = seat.id;
});

describe("limpeza periódica", () => {
  it("expira reserva vencida que ninguém disputou", async () => {
    const reserva = await prisma.reservation.create({
      data: {
        eventId,
        customerId,
        seatId,
        status: "PENDING",
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const resultado = await runHousekeeping(prisma);

    expect(resultado.expiredReservations).toBe(1);
    await expect(
      prisma.reservation.findUniqueOrThrow({ where: { id: reserva.id } }),
    ).resolves.toMatchObject({ status: "EXPIRED" });
  });

  it("libera o assento que a reserva vencida segurava", async () => {
    await prisma.reservation.create({
      data: {
        eventId,
        customerId,
        seatId,
        status: "PENDING",
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    await runHousekeeping(prisma);

    const livres = await prisma.seat.count({
      where: {
        eventId,
        reservations: { none: { status: { in: ["PENDING", "CONFIRMED"] } } },
      },
    });
    expect(livres).toBe(1);
  });

  it("não toca em reserva dentro do prazo nem em confirmada", async () => {
    await prisma.reservation.create({
      data: {
        eventId,
        customerId,
        seatId,
        status: "CONFIRMED",
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const resultado = await runHousekeeping(prisma);

    expect(resultado.expiredReservations).toBe(0);
  });

  it("apaga token revogado e vencido há mais de uma semana", async () => {
    await prisma.refreshToken.create({
      data: {
        userId: customerId,
        tokenHash: "hash-velho",
        expiresAt: HÁ_DEZ_DIAS,
      },
    });
    await prisma.refreshToken.create({
      data: {
        userId: customerId,
        tokenHash: "hash-atual",
        expiresAt: new Date(Date.now() + 604_800_000),
      },
    });

    const resultado = await runHousekeeping(prisma);

    expect(resultado.deletedRefreshTokens).toBe(1);
    await expect(prisma.refreshToken.count()).resolves.toBe(1);
  });

  it("preserva token revogado recentemente, que ainda pode denunciar reuso", async () => {
    await prisma.refreshToken.create({
      data: {
        userId: customerId,
        tokenHash: "hash-revogado-ontem",
        expiresAt: new Date(Date.now() + 604_800_000),
        revokedAt: new Date(Date.now() - 86_400_000),
      },
    });

    await runHousekeeping(prisma);

    await expect(prisma.refreshToken.count()).resolves.toBe(1);
  });
});
