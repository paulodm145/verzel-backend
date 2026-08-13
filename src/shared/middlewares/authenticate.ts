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
 * As quatro recusas respondem 401, mas em dois grupos de mensagem:
 *
 * - **Forma da requisição** — cabeçalho ausente ou fora do formato `Bearer
 *   <token>`. Aqui a mensagem é específica, porque não revela nada: quem chamou
 *   já sabe o que mandou. Mensagens genéricas neste ponto custam horas de
 *   depuração a quem está integrando, e foi o que aconteceu na prática.
 * - **Validade do token** — assinatura inválida, chave errada ou expirado.
 *   Estas três respondem **exatamente igual**, porque distinguir revelaria a
 *   quem sonda se um token forjado chegou perto de ser aceito (RN-8).
 */
export const authenticate: RequestHandler = (
  request: Request,
  _response: Response,
  next: NextFunction,
): void => {
  const header = request.get("authorization");

  if (!header) {
    next(
      new UnauthorizedError(
        "Autenticação obrigatória: envie o cabeçalho Authorization",
      ),
    );

    return;
  }

  const token = BEARER.exec(header)?.[1];

  if (!token) {
    next(
      new UnauthorizedError(
        'Formato inválido do cabeçalho Authorization: use "Bearer <token>"',
      ),
    );

    return;
  }

  // "Bearer Bearer <token>" é o erro clássico de quem digita o esquema no campo
  // do Swagger, que já o acrescenta sozinho. Dizer isso não revela nada sobre
  // token nenhum — é a forma do que foi enviado
  if (BEARER.test(token)) {
    next(
      new UnauthorizedError(
        'O valor do token não deve repetir "Bearer": envie apenas o token',
      ),
    );

    return;
  }

  verifyAccessToken(token)
    .then((claims) => {
      store.set(request, claims);
      next();
    })
    .catch(() => {
      // Uma única mensagem para inválido, adulterado e expirado
      next(new UnauthorizedError("Sessão inválida ou expirada"));
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
