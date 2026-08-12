import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { createAuthRepository } from "../../modules/auth/auth.repository.js";
import { seedDatabase, seedUsers } from "../../modules/auth/auth.seed.js";
import { createAuthService } from "../../modules/auth/auth.service.js";
import { createGateRepository } from "../../modules/gate/gate.repository.js";
import { createGateService } from "../../modules/gate/gate.service.js";
import {
  buildQrContent,
  verifyQrContent,
} from "../../modules/tickets/qrcode.service.js";
import { createTestPrismaClient, truncateAll } from "../helpers/database.js";

describe("seed de usuários", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    await truncateAll(prisma);
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("cria um organizador, dois clientes e uma portaria", async () => {
    const porPapel = await prisma.user.groupBy({
      by: ["role"],
      _count: { _all: true },
    });
    const contagem = Object.fromEntries(
      porPapel.map((linha) => [linha.role, linha._count._all]),
    );

    expect(contagem).toEqual({ ORGANIZER: 1, CUSTOMER: 2, GATE: 1 });
  });

  it("guarda as senhas como hash, nunca em texto", async () => {
    const users = await prisma.user.findMany();

    for (const user of users) {
      expect(user.passwordHash.startsWith("scrypt$")).toBe(true);
      const semeado = seedUsers.find((seed) => seed.email === user.email);
      expect(user.passwordHash).not.toBe(semeado?.password);
    }
  });

  it("não duplica quando roda de novo", async () => {
    await seedDatabase(prisma);

    await expect(prisma.user.count()).resolves.toBe(seedUsers.length);
  });

  it("cria um evento publicado com assentos livres", async () => {
    const event = await prisma.event.findFirstOrThrow();

    expect(event.status).toBe("PUBLISHED");

    const assentos = await prisma.seat.count({ where: { eventId: event.id } });
    expect(assentos).toBe(event.capacity);
  });

  it("deixa um ingresso pronto para a portaria validar", async () => {
    const ticket = await prisma.ticket.findFirstOrThrow({
      include: { reservation: { include: { seat: true, event: true } } },
    });

    expect(ticket.status).toBe("VALID");
    expect(ticket.reservation.status).toBe("CONFIRMED");

    // O QR do ingresso semeado confere de verdade
    const payload = verifyQrContent(
      buildQrContent({
        ticketId: ticket.id,
        eventId: ticket.reservation.event.id,
        code: ticket.code,
      }),
    );
    expect(payload).toMatchObject({ code: ticket.code });
  });

  it("a portaria valida o ingresso semeado", async () => {
    const ticket = await prisma.ticket.findFirstOrThrow({
      include: { reservation: true },
    });
    const portaria = await prisma.user.findFirstOrThrow({
      where: { role: "GATE" },
    });
    const gate = createGateService(createGateRepository(prisma));

    const resultado = await gate.validate(portaria.id, {
      code: ticket.code,
      eventId: ticket.reservation.eventId,
    });

    expect(resultado.result).toBe("VALID");
  });

  it("não duplica o evento nem o ingresso ao rodar de novo", async () => {
    await seedDatabase(prisma);

    await expect(prisma.event.count()).resolves.toBe(1);
    await expect(prisma.ticket.count()).resolves.toBe(1);
    await expect(prisma.reservation.count()).resolves.toBe(1);
  });

  it("autentica com cada credencial documentada no README", async () => {
    const service = createAuthService(createAuthRepository(prisma));

    for (const user of seedUsers) {
      const result = await service.login({
        email: user.email,
        password: user.password,
      });

      expect(result.user.role).toBe(user.role);
    }
  });
});
