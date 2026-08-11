import type { ErrorRequestHandler, NextFunction, Request, Response } from "express";

import type { Logger } from "pino";

import { getLogger } from "../lib/logger.js";
import { isAppError, type ErrorDetail } from "../errors/index.js";
import { getRequestId } from "./request-id.js";

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: readonly ErrorDetail[];
    requestId: string;
  };
}

/** O `body-parser` sinaliza JSON malformado assim; não há classe própria. */
function isMalformedJson(error: unknown): boolean {
  return (
    error instanceof SyntaxError &&
    "body" in error &&
    "status" in error &&
    error.status === 400
  );
}

function buildBody(
  code: string,
  message: string,
  requestId: string,
  details?: readonly ErrorDetail[],
): ErrorBody {
  return {
    error: { code, message, requestId, ...(details ? { details } : {}) },
  };
}

/**
 * Ponto único de saída para todo erro da aplicação (RN-2).
 *
 * A fronteira que importa é entre **esperado** e **inesperado**: `AppError`
 * responde com sua própria mensagem, porque foi escrita para ser lida pelo
 * cliente. Qualquer outra coisa vira 500 genérico com o `requestId`, e o detalhe
 * fica só no log — é o que a RN-3 exige, e o motivo de não haver ramo algum que
 * copie `error.message` para a resposta nesse caso.
 */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (
    error: unknown,
    request: Request,
    response: Response,
    next: NextFunction,
  ): void => {
    handle(error, request, response, next, logger);
  };
}

export const errorHandler: ErrorRequestHandler = (
  error,
  request,
  response,
  next,
) => {
  handle(error, request, response, next, getLogger());
};

function handle(
  error: unknown,
  request: Request,
  response: Response,
  next: NextFunction,
  logger: Logger,
): void {
  // Resposta já iniciada: só o Express sabe encerrá-la em segurança
  if (response.headersSent) {
    next(error);
    return;
  }

  const requestId = getRequestId(request);

  if (isAppError(error)) {
    logger.info(
      { requestId, code: error.code, path: request.path },
      "requisição recusada por regra de negócio",
    );

    response
      .status(error.statusCode)
      .json(buildBody(error.code, error.message, requestId, error.details));
    return;
  }

  if (isMalformedJson(error)) {
    logger.info({ requestId, path: request.path }, "corpo JSON malformado");

    response
      .status(400)
      .json(
        buildBody(
          "MALFORMED_JSON",
          "O corpo da requisição não é um JSON válido",
          requestId,
        ),
      );
    return;
  }

  logger.error(
    { requestId, path: request.path, err: error },
    "falha inesperada ao processar a requisição",
  );

  response
    .status(500)
    .json(
      buildBody(
        "INTERNAL_ERROR",
        "Erro interno ao processar a requisição",
        requestId,
      ),
    );
};
