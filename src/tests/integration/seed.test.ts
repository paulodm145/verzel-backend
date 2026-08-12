import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { createAuthRepository } from "../../modules/auth/auth.repository.js";
import { seedDatabase, seedUsers } from "../../modules/auth/auth.seed.js";
import { createAuthService } from "../../modules/auth/auth.service.js";
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
