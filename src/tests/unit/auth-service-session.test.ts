import { beforeEach, describe, expect, it } from "vitest";

import {
  createAuthService,
  type AuthService,
} from "../../modules/auth/auth.service.js";
import { hashRefreshToken } from "../../modules/auth/token.service.js";
import { UnauthorizedError } from "../../shared/errors/index.js";
import {
  createFakeAuthRepository,
  type FakeAuthRepository,
} from "../helpers/fake-auth-repository.js";

const registration = {
  name: "Pessoa Cliente",
  email: "pessoa@example.com",
  password: "senha-de-teste-123",
};

let repository: FakeAuthRepository;
let service: AuthService;

beforeEach(() => {
  repository = createFakeAuthRepository();
  service = createAuthService(repository);
});

function activeTokenCount(): number {
  return [...repository.tokens.values()].filter((token) => !token.revokedAt)
    .length;
}

describe("renovação", () => {
  it("devolve um par novo e invalida o token usado", async () => {
    const { session } = await service.register(registration);

    const renewed = await service.refresh(session.refreshToken);

    expect(renewed.refreshToken).not.toBe(session.refreshToken);
    await expect(service.refresh(session.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("aceita o token novo depois da rotação", async () => {
    const { session } = await service.register(registration);

    const primeira = await service.refresh(session.refreshToken);
    const segunda = await service.refresh(primeira.refreshToken);

    expect(segunda.accessToken).toBeTruthy();
    expect(segunda.refreshToken).not.toBe(primeira.refreshToken);
  });

  it("recusa token desconhecido", async () => {
    await expect(service.refresh("token-que-nunca-existiu")).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("recusa token expirado", async () => {
    const { session } = await service.register(registration);
    const stored = [...repository.tokens.values()][0];
    repository.tokens.set(stored!.id, {
      ...stored!,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(service.refresh(session.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("derruba todas as sessões quando um token revogado reaparece", async () => {
    // Duas sessões do mesmo usuário: um login em cada dispositivo
    const { session: primeiroDispositivo } = await service.register(registration);
    const { session: segundoDispositivo } = await service.login({
      email: registration.email,
      password: registration.password,
    });
    await service.refresh(primeiroDispositivo.refreshToken);
    expect(activeTokenCount()).toBe(2);

    // O token roubado é reapresentado depois de o legítimo já ter rotacionado
    await expect(
      service.refresh(primeiroDispositivo.refreshToken),
    ).rejects.toBeInstanceOf(UnauthorizedError);

    expect(activeTokenCount()).toBe(0);
    await expect(
      service.refresh(segundoDispositivo.refreshToken),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("logout", () => {
  it("invalida o token de renovação apresentado", async () => {
    const { session } = await service.register(registration);

    await service.logout(session.refreshToken);

    await expect(service.refresh(session.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("não derruba as outras sessões do usuário", async () => {
    const { session: primeira } = await service.register(registration);
    const { session: segunda } = await service.login({
      email: registration.email,
      password: registration.password,
    });

    await service.logout(primeira.refreshToken);

    await expect(service.refresh(segunda.refreshToken)).resolves.toMatchObject({
      accessToken: expect.any(String),
    });
  });

  it("aceita token desconhecido em silêncio — sair não confirma o que existe", async () => {
    await expect(service.logout("token-que-nunca-existiu")).resolves.toBeUndefined();
  });

  it("guarda apenas o hash: o token entregue não aparece no repositório", async () => {
    const { session } = await service.register(registration);

    const hashes = [...repository.tokens.values()].map(
      (token) => token.tokenHash,
    );

    expect(hashes).not.toContain(session.refreshToken);
    expect(hashes).toContain(hashRefreshToken(session.refreshToken));
  });
});
