import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { createReservationsRepository } from "../../modules/reservations/reservations.repository.js";
import { createReservationsService } from "../../modules/reservations/reservations.service.js";
import { ConflictError } from "../../shared/errors/index.js";
import { disconnectRedis, getRedis } from "../../shared/lib/redis.js";
import { createTestPrismaClient, truncateAll } from "../helpers/database.js";

/**
 * O teste mais importante do projeto: prova que o mesmo lugar não é vendido
 * duas vezes.
 *
 * Roda contra **Postgres de verdade**. Com repositório em memória ele provaria
 * apenas que o JavaScript é single-threaded, que não é a pergunta — a pergunta é
 * se o banco recusa a segunda escrita.
 */
describe("concorrência na reserva", () => {
  let prisma: PrismaClient;
  let eventId: string;
  let seatId: string;
  const customers: string[] = [];

  beforeAll(() => {
    prisma = createTestPrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await disconnectRedis();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    customers.length = 0;

    const organizer = await prisma.user.create({
      data: {
        name: "Olívia",
        email: "org@example.com",
        passwordHash: "scrypt$hash",
        role: "ORGANIZER",
      },
    });

    const event = await prisma.event.create({
      data: {
        organizerId: organizer.id,
        sourceType: "SHOW",
        externalId: "ext-1",
        title: "Show Lotado",
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

    for (let index = 0; index < 20; index += 1) {
      const customer = await prisma.user.create({
        data: {
          name: `Cliente ${String(index)}`,
          email: `cliente${String(index)}@example.com`,
          passwordHash: "scrypt$hash",
          role: "CUSTOMER",
        },
      });
      customers.push(customer.id);
    }

    // Lock limpo: um teste anterior não pode influenciar o próximo
    const redis = await getRedis();
    await redis.del(`lock:seat:${eventId}:${seatId}`);
  });

  async function countActiveReservations(): Promise<number> {
    return prisma.reservation.count({
      where: { seatId, status: { in: ["PENDING", "CONFIRMED"] } },
    });
  }

  function serviceWithLock() {
    return createReservationsService(createReservationsRepository(prisma));
  }

  /** Serviço como se o Redis estivesse fora: sem lock, só a constraint. */
  function serviceWithoutLock() {
    return createReservationsService(createReservationsRepository(prisma), {
      lockOptions: {
        redisProvider: () => Promise.reject(new Error("Redis inalcançável")),
      },
    });
  }

  async function raceFor(
    service: ReturnType<typeof serviceWithLock>,
    howMany: number,
  ): Promise<{ ok: number; conflicts: number; others: unknown[] }> {
    const results = await Promise.allSettled(
      customers
        .slice(0, howMany)
        .map((customerId) => service.reserve(customerId, eventId, seatId)),
    );

    const others = results
      .filter(
        (result) =>
          result.status === "rejected" &&
          !(result.reason instanceof ConflictError),
      )
      .map((result) => String((result as PromiseRejectedResult).reason));

    return {
      ok: results.filter((result) => result.status === "fulfilled").length,
      conflicts: results.filter(
        (result) =>
          result.status === "rejected" &&
          result.reason instanceof ConflictError,
      ).length,
      others,
    };
  }

  it("com duas requisições simultâneas, exatamente uma reserva", async () => {
    const { ok, conflicts, others } = await raceFor(serviceWithLock(), 2);

    expect(others).toEqual([]);
    expect(ok).toBe(1);
    expect(conflicts).toBe(1);
    await expect(countActiveReservations()).resolves.toBe(1);
  });

  it("com vinte requisições simultâneas, ainda exatamente uma reserva", async () => {
    const { ok, conflicts, others } = await raceFor(serviceWithLock(), 20);

    expect(others).toEqual([]);
    expect(ok).toBe(1);
    expect(conflicts).toBe(19);
    await expect(countActiveReservations()).resolves.toBe(1);
  });

  it("sem Redis, a constraint sozinha segura o overselling", async () => {
    // Sem lock, todas as requisições passam pela verificação ao mesmo tempo.
    // Se a integridade dependesse do lock, aqui apareceriam duas reservas.
    const { ok, conflicts, others } = await raceFor(serviceWithoutLock(), 20);

    expect(others).toEqual([]);
    expect(ok).toBe(1);
    expect(conflicts).toBe(19);
    await expect(countActiveReservations()).resolves.toBe(1);
  });

  it("o assento volta a ser vendável depois que a reserva vence", async () => {
    const service = serviceWithLock();
    const primeira = await service.reserve(customers[0] ?? "", eventId, seatId);

    // Vence a reserva no banco, como o relógio faria
    await prisma.reservation.update({
      where: { id: primeira.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const segunda = await service.reserve(customers[1] ?? "", eventId, seatId);

    expect(segunda.id).not.toBe(primeira.id);
    await expect(countActiveReservations()).resolves.toBe(1);
    await expect(
      prisma.reservation.findUnique({ where: { id: primeira.id } }),
    ).resolves.toMatchObject({ status: "EXPIRED" });
  });

  it("reserva confirmada não é liberada por prazo", async () => {
    const service = serviceWithLock();
    const reserva = await service.reserve(customers[0] ?? "", eventId, seatId);
    await prisma.reservation.update({
      where: { id: reserva.id },
      data: { status: "CONFIRMED", expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(
      service.reserve(customers[1] ?? "", eventId, seatId),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
