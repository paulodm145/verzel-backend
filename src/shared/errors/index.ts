/** Detalhe seguro de exibir ao cliente — nunca contém dado interno. */
export interface ErrorDetail {
  readonly path: string;
  readonly message: string;
}

/**
 * Erro **esperado**: uma situação prevista pelas regras de negócio, cuja
 * mensagem pode ser mostrada ao cliente. O que não descende daqui é tratado
 * como falha inesperada e vira 500 genérico (RN-3).
 */
export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;
  readonly details?: readonly ErrorDetail[];

  constructor(message: string, details?: readonly ErrorDetail[]) {
    super(message);
    this.name = new.target.name;

    if (details) {
      this.details = details;
    }

    // Sem isto, `instanceof` falha para subclasses quando o alvo de compilação
    // é anterior a ES2015
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly code = "VALIDATION_ERROR";
}

export class UnauthorizedError extends AppError {
  readonly statusCode = 401;
  readonly code = "UNAUTHORIZED";

  constructor(message = "Credenciais ausentes ou inválidas") {
    super(message);
  }
}

export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly code = "FORBIDDEN";

  constructor(message = "Acesso negado para este recurso") {
    super(message);
  }
}

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = "NOT_FOUND";

  constructor(resource: string) {
    super(`${resource} não encontrado`);
  }
}

export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = "CONFLICT";
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
