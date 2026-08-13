import type { NextFunction, Request, RequestHandler, Response } from "express";

import { AppError } from "../errors/index.js";
import { getLogger } from "../lib/logger.js";
import { getRedis } from "../lib/redis.js";

class TooManyRequestsError extends AppError {
  readonly statusCode = 429;
  readonly code = "TOO_MANY_REQUESTS";
}

export interface RateLimitOptions {
  /** Prefixo da chave; separa um limite de outro. */
  readonly scope: string;
  readonly max: number;
  readonly windowSeconds: number;
  /** O que conta como "mesmo cliente". Padrão: o IP. */
  readonly identify?: (request: Request) => string;
}

/**
 * Limita tentativas por janela deslizante, com `INCR` e `EXPIRE`.
 *
 * O scrypt encarece o ataque **offline**, mas nada impedia milhares de
 * tentativas online contra o login — ainda mais com as senhas de demonstração
 * publicadas no README.
 *
 * Sem Redis, o limite simplesmente não se aplica e a requisição segue: recusar
 * logins porque o cache caiu seria transformar degradação em indisponibilidade,
 * a mesma escolha do lock (ADR 0003).
 */
export function rateLimit(options: RateLimitOptions): RequestHandler {
  const identify = options.identify ?? ((request) => request.ip ?? "sem-ip");

  return (request: Request, _response: Response, next: NextFunction): void => {
    void applyLimit(options, identify(request), next);
  };
}

async function applyLimit(
  options: RateLimitOptions,
  identity: string,
  next: NextFunction,
): Promise<void> {
  try {
    const redis = await getRedis();
    const key = `ratelimit:${options.scope}:${identity}`;
    const attempts = await redis.incr(key);

    if (attempts === 1) {
      await redis.expire(key, options.windowSeconds);
    }

    if (attempts > options.max) {
      next(
        new TooManyRequestsError(
          "Muitas tentativas. Aguarde alguns instantes e tente de novo.",
        ),
      );

      return;
    }
  } catch (error) {
    if (error instanceof TooManyRequestsError) {
      next(error);
      return;
    }

    getLogger().warn(
      { err: error, scope: options.scope },
      "limite de tentativas indisponível; seguindo sem ele",
    );
  }

  next();
}

/** Identidade combinada: quem tenta, e contra qual conta. */
export function byIpAndEmail(request: Request): string {
  const body = request.body as { email?: unknown } | undefined;
  const email = typeof body?.email === "string" ? body.email : "sem-email";

  return `${request.ip ?? "sem-ip"}:${email.toLowerCase()}`;
}
