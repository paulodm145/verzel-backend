import type { NextFunction, Request, RequestHandler, Response } from "express";

import { AppError } from "../errors/index.js";

class RouteNotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = "ROUTE_NOT_FOUND";
}

/**
 * Última rota da cadeia. Sem ela o Express responde um HTML próprio, quebrando
 * a promessa de envelope único de erro (RN-2).
 */
export const notFoundHandler: RequestHandler = (
  request: Request,
  _response: Response,
  next: NextFunction,
): void => {
  next(new RouteNotFoundError(`Rota ${request.method} ${request.path} não existe`));
};
