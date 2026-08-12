import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  createAuthRepository,
  type AuthRepository,
} from "../../modules/auth/auth.repository.js";
import { createTestPrismaClient, truncateAll } from "../helpers/database.js";

const inSevenDays = () => new Date(Date.now() + 604_800_000);

describe("AuthRepository sobre Prisma", () => {
  let prisma: PrismaClient;
  let repository: AuthRepository;

  beforeAll(() => {
    prisma = createTestPrismaClient();
    repository = createAuthRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  function createUser() {
    return repository.createUser({
      name: "Pessoa Cliente",
      email: "pessoa@example.com",
      passwordHash: "scrypt$hash",
      role: "CUSTOMER",
    });
  }

  it("cria e encontra usuário por e-mail e por id", async () => {
    const created = await createUser();

    await expect(
      repository.findUserByEmail("pessoa@example.com"),
    ).resolves.toMatchObject({ id: created.id, role: "CUSTOMER" });
    await expect(repository.findUserById(created.id)).resolves.toMatchObject({
      email: "pessoa@example.com",
    });
  });

  it("devolve null para quem não existe, em vez de lançar", async () => {
    await expect(
      repository.findUserByEmail("ninguem@example.com"),
    ).resolves.toBeNull();
    await expect(
      repository.findUserById("00000000-0000-0000-0000-000000000000"),
    ).resolves.toBeNull();
  });

  it("cria e encontra token de renovação pelo hash", async () => {
    const user = await createUser();

    const token = await repository.createRefreshToken({
      userId: user.id,
      tokenHash: "hash-um",
      expiresAt: inSevenDays(),
    });

    await expect(
      repository.findRefreshTokenByHash("hash-um"),
    ).resolves.toMatchObject({ id: token.id, revokedAt: null });
  });

  it("rotaciona revogando o atual e criando o substituto de uma vez", async () => {
    const user = await createUser();
    const current = await repository.createRefreshToken({
      userId: user.id,
      tokenHash: "hash-atual",
      expiresAt: inSevenDays(),
    });

    const replacement = await repository.rotateRefreshToken(current.id, {
      userId: user.id,
      tokenHash: "hash-novo",
      expiresAt: inSevenDays(),
    });

    await expect(
      repository.findRefreshTokenByHash("hash-atual"),
    ).resolves.toMatchObject({ revokedAt: expect.any(Date) });
    expect(replacement.revokedAt).toBeNull();
  });

  it("não deixa rastro quando a rotação falha no meio", async () => {
    const user = await createUser();
    const current = await repository.createRefreshToken({
      userId: user.id,
      tokenHash: "hash-atual",
      expiresAt: inSevenDays(),
    });
    await repository.createRefreshToken({
      userId: user.id,
      tokenHash: "hash-ocupado",
      expiresAt: inSevenDays(),
    });

    // O hash do substituto colide, então a criação falha: a transação tem de
    // desfazer também a revogação do atual
    await expect(
      repository.rotateRefreshToken(current.id, {
        userId: user.id,
        tokenHash: "hash-ocupado",
        expiresAt: inSevenDays(),
      }),
    ).rejects.toThrow();

    await expect(
      repository.findRefreshTokenByHash("hash-atual"),
    ).resolves.toMatchObject({ revokedAt: null });
  });

  it("revoga um token específico", async () => {
    const user = await createUser();
    const token = await repository.createRefreshToken({
      userId: user.id,
      tokenHash: "hash-um",
      expiresAt: inSevenDays(),
    });

    await repository.revokeRefreshToken(token.id);

    await expect(
      repository.findRefreshTokenByHash("hash-um"),
    ).resolves.toMatchObject({ revokedAt: expect.any(Date) });
  });

  it("revoga todas as sessões ativas de um usuário", async () => {
    const user = await createUser();
    await repository.createRefreshToken({
      userId: user.id,
      tokenHash: "hash-um",
      expiresAt: inSevenDays(),
    });
    await repository.createRefreshToken({
      userId: user.id,
      tokenHash: "hash-dois",
      expiresAt: inSevenDays(),
    });

    await repository.revokeAllRefreshTokensOfUser(user.id);

    const ativos = await prisma.refreshToken.count({
      where: { revokedAt: null },
    });
    expect(ativos).toBe(0);
  });
});
