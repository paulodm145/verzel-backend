import { describe, expect, it } from "vitest";

import { createAuthService } from "../../modules/auth/auth.service.js";
import { ConflictError, UnauthorizedError } from "../../shared/errors/index.js";
import { createFakeAuthRepository } from "../helpers/fake-auth-repository.js";

const registration = {
  name: "Pessoa Cliente",
  email: "pessoa@example.com",
  password: "senha-de-teste-123",
};

function buildService() {
  const repository = createFakeAuthRepository();

  return { repository, service: createAuthService(repository) };
}

describe("cadastro", () => {
  it("cria o usuário como CUSTOMER e devolve a sessão", async () => {
    const { service } = buildService();

    const result = await service.register(registration);

    expect(result.user.role).toBe("CUSTOMER");
    expect(result.user.email).toBe("pessoa@example.com");
    expect(result.session.accessToken).toBeTruthy();
    expect(result.session.refreshToken).toBeTruthy();
  });

  it("não devolve nem armazena a senha em texto", async () => {
    const { repository, service } = buildService();

    const result = await service.register(registration);

    expect(JSON.stringify(result)).not.toContain(registration.password);
    const stored = [...repository.users.values()][0];
    expect(stored?.passwordHash).not.toBe(registration.password);
  });

  it("recusa e-mail já cadastrado sem criar uma segunda conta", async () => {
    const { repository, service } = buildService();
    await service.register(registration);

    await expect(service.register(registration)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(repository.users.size).toBe(1);
  });
});

describe("login", () => {
  it("autentica com as credenciais corretas", async () => {
    const { service } = buildService();
    await service.register(registration);

    const result = await service.login({
      email: registration.email,
      password: registration.password,
    });

    expect(result.user.email).toBe(registration.email);
    expect(result.session.accessToken).toBeTruthy();
  });

  it("recusa senha errada", async () => {
    const { service } = buildService();
    await service.register(registration);

    await expect(
      service.login({ email: registration.email, password: "errada-mesmo" }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("responde a e-mail inexistente exatamente como a senha errada", async () => {
    const { service } = buildService();
    await service.register(registration);

    async function failedLogin(
      email: string,
      password: string,
    ): Promise<UnauthorizedError> {
      try {
        await service.login({ email, password });
      } catch (error) {
        return error as UnauthorizedError;
      }

      throw new Error("o login deveria ter falhado");
    }

    const semUsuario = await failedLogin(
      "ninguem@example.com",
      "qualquer-coisa",
    );
    const senhaErrada = await failedLogin(registration.email, "errada-mesmo");

    expect(semUsuario.statusCode).toBe(senhaErrada.statusCode);
    expect(semUsuario.code).toBe(senhaErrada.code);
    expect(semUsuario.message).toBe(senhaErrada.message);
  });

  it("verifica a senha mesmo sem usuário, para o tempo não denunciar a conta", async () => {
    const { service } = buildService();

    const startedAt = performance.now();
    await service
      .login({ email: "ninguem@example.com", password: "qualquer-coisa" })
      .catch(() => undefined);
    const elapsed = performance.now() - startedAt;

    // A igualdade de tempos não se testa por relógio sem gerar falha
    // intermitente. O que se testa é o limite inferior: sem a verificação
    // contra o hash de mentira, este caminho responderia em microssegundos e
    // denunciaria, por tempo, que a conta não existe (RN-3).
    expect(elapsed).toBeGreaterThan(50);
  });
});

describe("perfil", () => {
  it("devolve o usuário do token", async () => {
    const { service } = buildService();
    const created = await service.register(registration);

    await expect(service.profile(created.user.id)).resolves.toMatchObject({
      email: registration.email,
    });
  });

  it("recusa id de usuário que não existe mais", async () => {
    const { service } = buildService();

    await expect(
      service.profile("00000000-0000-0000-0000-000000000000"),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
