import type { NextFunction, Request, RequestHandler, Response } from "express";

import { getEnv } from "../config/index.js";
import { getLogger } from "../lib/logger.js";
import { getRedis } from "../lib/redis.js";
import { getAuth } from "./authenticate.js";

interface StoredResponse {
  readonly status: number;
  readonly body: unknown;
}

/**
 * Reproduz a resposta de uma requisição já processada, quando ela chega de novo
 * com o mesmo `Idempotency-Key`.
 *
 * Cobre o caso comum de fluxo de pagamento: duplo clique, retry do navegador,
 * reenvio depois de uma falha de rede. Sem isso, o cliente acaba com duas
 * reservas — ou duas cobranças — por um problema que nem foi dele.
 *
 * A chave inclui o usuário, para que a chave escolhida por um cliente não colida
 * com a de outro. E só respostas de sucesso são gravadas: erro transitório deve
 * poder ser tentado de novo.
 *
 * Sem Redis, a idempotência simplesmente não acontece e a requisição segue
 * (RN-6). O contrário — recusar a compra porque o cache caiu — seria pior do que
 * o problema que ela evita.
 */
export function idempotent(scope: string): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    const key = request.get("idempotency-key");

    if (!key) {
      next();
      return;
    }

    const storageKey = `idempotency:${scope}:${getAuth(request).userId}:${key}`;

    void replayOrCapture(storageKey, response, next);
  };
}

async function replayOrCapture(
  storageKey: string,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const stored = await readStored(storageKey);

  if (stored) {
    response
      .status(stored.status)
      .set("idempotency-replayed", "true")
      .json(stored.body);

    return;
  }

  captureResponse(storageKey, response);
  next();
}

async function readStored(storageKey: string): Promise<StoredResponse | null> {
  try {
    const redis = await getRedis();
    const cached = await redis.get(storageKey);

    return cached ? (JSON.parse(cached) as StoredResponse) : null;
  } catch (error) {
    getLogger().warn(
      { err: error },
      "idempotência indisponível; processando a requisição normalmente",
    );

    return null;
  }
}

/** Envolve `res.json` para gravar o que foi respondido, sem tocar no handler. */
function captureResponse(storageKey: string, response: Response): void {
  const originalJson = response.json.bind(response);

  response.json = (body: unknown): Response => {
    if (response.statusCode < 400) {
      void store(storageKey, { status: response.statusCode, body });
    }

    return originalJson(body);
  };
}

async function store(storageKey: string, value: StoredResponse): Promise<void> {
  try {
    const redis = await getRedis();
    await redis.set(storageKey, JSON.stringify(value), {
      expiration: { type: "EX", value: getEnv().IDEMPOTENCY_TTL },
    });
  } catch {
    // Repetição não protegida é degradação aceita; derrubar a resposta, não
  }
}
