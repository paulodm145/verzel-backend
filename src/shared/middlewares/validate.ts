import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { z, ZodError, ZodType } from "zod";

import { ValidationError, type ErrorDetail } from "../errors/index.js";

export interface ValidationSchemas {
  readonly body?: ZodType;
  readonly query?: ZodType;
  readonly params?: ZodType;
}

interface ValidatedData {
  body: unknown;
  query: unknown;
  params: unknown;
}

const store = new WeakMap<Request, ValidatedData>();

function toDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    path: issue.path.join(".") || "(corpo)",
    message: issue.message,
  }));
}

/**
 * Valida body, query e params na borda (RN-1).
 *
 * O resultado é guardado à parte em vez de sobrescrever a requisição: em
 * Express 5 `req.query` é somente leitura, e atribuir ali lança em runtime.
 * Guardar os três no mesmo lugar também evita a armadilha de o handler ler
 * `req.query` — o valor cru, sem conversão — achando que leu o validado.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const details: ErrorDetail[] = [];
    const data: ValidatedData = {
      body: undefined,
      query: undefined,
      params: undefined,
    };

    for (const source of ["body", "query", "params"] as const) {
      const schema = schemas[source];

      if (!schema) {
        continue;
      }

      const result = schema.safeParse(request[source]);

      if (result.success) {
        data[source] = result.data;
      } else {
        details.push(...toDetails(result.error));
      }
    }

    if (details.length > 0) {
      next(new ValidationError("Dados de entrada inválidos", details));
      return;
    }

    store.set(request, data);
    next();
  };
}

type InferOrUndefined<T> = T extends ZodType ? z.infer<T> : undefined;

export interface ValidatedOf<S extends ValidationSchemas> {
  body: InferOrUndefined<S["body"]>;
  query: InferOrUndefined<S["query"]>;
  params: InferOrUndefined<S["params"]>;
}

/**
 * Dados validados da requisição, tipados a partir dos mesmos schemas passados
 * ao `validate`. Receber os schemas de novo é proposital: amarra o tipo lido ao
 * schema que de fato validou, em vez de deixar o handler declarar um tipo que
 * pode divergir em silêncio.
 */
export function validated<S extends ValidationSchemas>(
  request: Request,
  _schemas: S,
): ValidatedOf<S> {
  const data = store.get(request);

  if (!data) {
    throw new Error(
      "validated() chamado numa rota sem o middleware validate(). " +
        "Todo dado de entrada precisa passar pela validação (RN-1).",
    );
  }

  return data as ValidatedOf<S>;
}
