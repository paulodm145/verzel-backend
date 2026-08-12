import type { NextFunction, Request, RequestHandler, Response } from "express";

import { getEnv } from "../config/index.js";

/**
 * Cabeçalho que o cliente precisa **ler** na resposta. Por padrão o navegador
 * só expõe um punhado de cabeçalhos ao JavaScript, e o `Idempotency-Replayed`
 * não está entre eles — sem declará-lo aqui, o frontend nunca saberia que
 * recebeu uma resposta reproduzida.
 */
const EXPOSED_HEADERS = "Idempotency-Replayed";

const ALLOWED_HEADERS = "Content-Type, Authorization, Idempotency-Key";
const ALLOWED_METHODS = "GET, POST, PATCH, DELETE, OPTIONS";
const PREFLIGHT_MAX_AGE = "86400";

function allowedOrigins(): string[] {
  return getEnv()
    .CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Libera o frontend, que roda em outra origem.
 *
 * Não usa `*` de propósito: a API é chamada com `Authorization`, e responder
 * curinga a uma requisição autenticada é o tipo de configuração que passa em
 * desenvolvimento e vira problema depois. A lista vem do ambiente.
 *
 * Escrito à mão em vez de somar o pacote `cors`: são vinte linhas, e a seção 2
 * do CLAUDE.md manda avaliar antes de instalar.
 */
export const cors: RequestHandler = (
  request: Request,
  response: Response,
  next: NextFunction,
): void => {
  const origin = request.get("origin");

  if (origin && allowedOrigins().includes(origin)) {
    response.set("Access-Control-Allow-Origin", origin);
    // Sem isto, um cache intermediário serviria a resposta de uma origem para
    // outra
    response.set("Vary", "Origin");
    response.set("Access-Control-Allow-Credentials", "true");
    response.set("Access-Control-Expose-Headers", EXPOSED_HEADERS);
  }

  if (request.method === "OPTIONS") {
    response
      .set("Access-Control-Allow-Methods", ALLOWED_METHODS)
      .set("Access-Control-Allow-Headers", ALLOWED_HEADERS)
      .set("Access-Control-Max-Age", PREFLIGHT_MAX_AGE)
      .status(204)
      .send();

    return;
  }

  next();
};
