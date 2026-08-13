import { createHash } from "node:crypto";

import type { NextFunction, Request, RequestHandler, Response } from "express";

import { getEnv } from "../config/index.js";
import { ConflictError } from "../errors/index.js";
import { getLogger } from "../lib/logger.js";
import { getRedis } from "../lib/redis.js";
import { getAuth } from "./authenticate.js";

interface StoredResponse {
  readonly status: number;
  readonly body: unknown;
  /**
   * Impressão digital do corpo da primeira requisição. Sem ela, reaproveitar a
   * mesma chave para pedidos diferentes — reservar o A1 e depois o A2 —
   * devolveria a resposta do primeiro, e o cliente acreditaria ter reservado o
   * assento errado. Falha silenciosa é pior que erro.
   */
  readonly fingerprint: string;
}

function fingerprintOf(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body ?? null)).digest("hex");
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

    void replayOrCapture(
      storageKey,
      fingerprintOf(request.body),
      response,
      next,
    );
  };
}

async function replayOrCapture(
  storageKey: string,
  fingerprint: string,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const stored = await readStored(storageKey);

  if (stored) {
    // Mesma chave com corpo diferente é erro de quem chama, e reproduzir a
    // resposta antiga esconderia o problema: o cliente acharia que fez o
    // segundo pedido quando recebeu o resultado do primeiro
    if (stored.fingerprint !== fingerprint) {
      next(
        new ConflictError(
          "Esta Idempotency-Key já foi usada com um corpo diferente",
        ),
      );

      return;
    }

    response
      .status(stored.status)
      .set("idempotency-replayed", "true")
      .json(stored.body);

    return;
  }

  captureResponse(storageKey, fingerprint, response);
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
function captureResponse(
  storageKey: string,
  fingerprint: string,
  response: Response,
): void {
  const originalJson = response.json.bind(response);

  response.json = (body: unknown): Response => {
    if (response.statusCode < 400) {
      void store(storageKey, {
        status: response.statusCode,
        body,
        fingerprint,
      });
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
