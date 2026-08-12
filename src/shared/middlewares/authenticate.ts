import type { NextFunction, Request, RequestHandler, Response } from "express";

import type { Role } from "../../generated/prisma/enums.js";
import { verifyAccessToken } from "../../modules/auth/token.service.js";
import { UnauthorizedError } from "../errors/index.js";

export interface AuthContext {
  readonly userId: string;
  readonly role: Role;
}

/**
 * Mesmo padrão de `middlewares/validate.ts`: o contexto fica num WeakMap
 * indexado pela requisição, em vez de virar um campo opcional em `Request`. Um
 * campo opcional obrigaria todo handler a checar se existe, e o `getAuth`
 * abaixo transforma essa checagem numa só, feita no lugar certo.
 */
const store = new WeakMap<Request, AuthContext>();

const BEARER = /^Bearer (.+)$/;

/**
 * Identifica o solicitante a partir do cabeçalho `Authorization`.
 *
 * Ausência de cabeçalho, formato errado, assinatura inválida e token expirado
 * terminam todos em 401 com a mesma mensagem: dizer qual dos quatro foi só
 * ajudaria quem está sondando (RN-8).
 */
export const authenticate: RequestHandler = (
  request: Request,
  _response: Response,
  next: NextFunction,
): void => {
  const header = request.get("authorization");
  const match = header ? BEARER.exec(header) : null;
  const token = match?.[1];

  if (!token) {
    next(new UnauthorizedError("Autenticação obrigatória"));
    return;
  }

  verifyAccessToken(token)
    .then((claims) => {
      store.set(request, claims);
      next();
    })
    .catch(() => {
      next(new UnauthorizedError("Autenticação obrigatória"));
    });
};

/**
 * Contexto de autenticação da requisição.
 *
 * Lança se chamado numa rota sem `authenticate` — é erro de montagem de rota,
 * não condição de execução, e falhar alto é melhor do que devolver um
 * `undefined` que vira 500 três camadas adiante.
 */
export function getAuth(request: Request): AuthContext {
  const context = store.get(request);

  if (!context) {
    throw new Error(
      "getAuth() chamado numa rota sem o middleware authenticate().",
    );
  }

  return context;
}
