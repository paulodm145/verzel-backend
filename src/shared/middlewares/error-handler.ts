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

/**
 * O `body-parser` não expõe classes de erro: sinaliza com objetos no estilo
 * `http-errors`, que trazem `status` e um `type` descritivo. São falhas do
 * cliente — corpo ilegível, grande demais, codificação não suportada — e tratá-las
 * como inesperadas contabilizaria erro de cliente como falha do servidor.
 */
function asClientError(
  error: unknown,
): { status: number; code: string; message: string } | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const candidate = error as { status?: unknown; type?: unknown };
  const status = typeof candidate.status === "number" ? candidate.status : 0;

  if (status < 400 || status >= 500) {
    return undefined;
  }

  switch (candidate.type) {
    case "entity.parse.failed":
      return {
        status: 400,
        code: "MALFORMED_JSON",
        message: "O corpo da requisição não é um JSON válido",
      };
    case "entity.too.large":
      return {
        status: 413,
        code: "PAYLOAD_TOO_LARGE",
        message: "O corpo da requisição excede o tamanho máximo aceito",
      };
    default:
      return {
        status,
        code: "BAD_REQUEST",
        message: "Não foi possível interpretar a requisição",
      };
  }
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

  const clientError = asClientError(error);

  if (clientError) {
    logger.info(
      { requestId, path: request.path, code: clientError.code },
      "requisição malformada",
    );

    response
      .status(clientError.status)
      .json(buildBody(clientError.code, clientError.message, requestId));
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
