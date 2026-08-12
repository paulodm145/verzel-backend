import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { createTestPrismaClient, truncateAll } from "../helpers/database.js";

describe("modelo RefreshToken", () => {
  let prisma: PrismaClient;
  const userId = "88888888-8888-8888-8888-888888888888";

  beforeAll(() => {
    prisma = createTestPrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);

    await prisma.user.create({
      data: {
        id: userId,
        name: "Cliente",
        email: "cliente@example.com",
        passwordHash: "scrypt$fake",
        role: "CUSTOMER",
      },
    });
  });

  function createToken(tokenHash: string) {
    return prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 604_800_000),
      },
    });
  }

  it("rejeita dois registros com o mesmo hash", async () => {
    await createToken("hash-repetido");

    await expect(createToken("hash-repetido")).rejects.toThrow();
  });

  it("apaga as sessões junto com o usuário", async () => {
    await createToken("hash-do-usuario");

    await prisma.user.delete({ where: { id: userId } });

    await expect(prisma.refreshToken.count()).resolves.toBe(0);
  });

  it("nasce válido, com revogação em aberto", async () => {
    const token = await createToken("hash-novo");

    expect(token.revokedAt).toBeNull();
  });
});
