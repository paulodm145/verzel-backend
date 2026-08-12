import { describe, expect, it } from "vitest";

import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  isAppError,
} from "../../shared/errors/index.js";

describe("erros de domínio", () => {
  it.each([
    [new ValidationError("inválido"), 400, "VALIDATION_ERROR"],
    [new UnauthorizedError(), 401, "UNAUTHORIZED"],
    [new ForbiddenError(), 403, "FORBIDDEN"],
    [new NotFoundError("Evento"), 404, "NOT_FOUND"],
    [new ConflictError("assento ocupado"), 409, "CONFLICT"],
  ])("%s mapeia para status e código próprios", (error, status, code) => {
    expect(error.statusCode).toBe(status);
    expect(error.code).toBe(code);
  });

  it("é reconhecível por isAppError", () => {
    expect(isAppError(new NotFoundError("Evento"))).toBe(true);
    expect(isAppError(new Error("qualquer outro"))).toBe(false);
    expect(isAppError("nem é erro")).toBe(false);
  });

  it("preserva a mensagem recebida", () => {
    expect(new ConflictError("assento ocupado").message).toBe(
      "assento ocupado",
    );
  });

  it("nomeia o recurso não encontrado", () => {
    expect(new NotFoundError("Evento").message).toMatch(/Evento/);
  });

  it("carrega os detalhes de validação quando informados", () => {
    const error = new ValidationError("Dados inválidos", [
      { path: "email", message: "E-mail inválido" },
    ]);

    expect(error.details).toEqual([
      { path: "email", message: "E-mail inválido" },
    ]);
  });

  it("mantém a cadeia de protótipo para instanceof funcionar", () => {
    const error = new NotFoundError("Evento");

    expect(error).toBeInstanceOf(NotFoundError);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
  });

  it("preserva o nome da classe na propriedade name", () => {
    expect(new ConflictError("x").name).toBe("ConflictError");
  });
});
