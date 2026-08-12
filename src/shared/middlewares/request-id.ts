import { randomUUID } from "node:crypto";

import type { NextFunction, Request, RequestHandler, Response } from "express";

const HEADER = "x-request-id";
const MAX_LENGTH = 128;

const store = new WeakMap<Request, string>();

/**
 * Correlaciona resposta e log. O identificador vai no cabeçalho da resposta e
 * acompanha toda linha de log da requisição, o que permite achar no log o erro
 * que gerou um 500 a partir do que o cliente recebeu (RN-3).
 *
 * Um identificador vindo do cliente é reaproveitado — útil quando há um gateway
 * na frente —, mas só se for plausível: valor vazio ou longo demais é descartado,
 * porque entra em toda linha de log e é entrada não confiável.
 */
export const requestId: RequestHandler = (
  request: Request,
  response: Response,
  next: NextFunction,
): void => {
  const incoming = request.headers[HEADER];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  const trimmed = candidate?.trim();

  const id =
    trimmed && trimmed.length > 0 && trimmed.length <= MAX_LENGTH
      ? trimmed
      : randomUUID();

  store.set(request, id);
  response.setHeader(HEADER, id);

  next();
};

/** Identificador da requisição, ou `desconhecido` fora do ciclo de requisição. */
export function getRequestId(request: Request): string {
  return store.get(request) ?? "desconhecido";
}
