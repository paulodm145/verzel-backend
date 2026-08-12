import type { NextFunction, Request, RequestHandler, Response } from "express";

import type { Role } from "../../generated/prisma/enums.js";
import { ForbiddenError } from "../errors/index.js";
import { getAuth } from "./authenticate.js";

/**
 * Restringe a rota aos papéis informados. Usar sempre depois de `authenticate`:
 * sem identidade não há papel a comparar, e `getAuth` deixa isso explícito.
 *
 * Papel insuficiente é 403, não 401 — a diferença importa. 401 diz "não sei
 * quem você é"; 403 diz "sei, e não basta". Devolver 401 aqui faria o cliente
 * tentar renovar a sessão para um problema que renovar não resolve (RN-8).
 */
export function requireRole(...roles: readonly Role[]): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const { role } = getAuth(request);

    if (!roles.includes(role)) {
      next(new ForbiddenError("Papel insuficiente para esta operação"));
      return;
    }

    next();
  };
}
