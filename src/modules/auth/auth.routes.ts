import { Router, type RequestHandler } from "express";

import { authenticate } from "../../shared/middlewares/authenticate.js";
import {
  byIpAndEmail,
  rateLimit,
} from "../../shared/middlewares/rate-limit.js";
import { validate } from "../../shared/middlewares/validate.js";
import { createAuthController } from "./auth.controller.js";
import { createAuthRepository } from "./auth.repository.js";
import { loginSchema, refreshSchema, registerSchema } from "./auth.schema.js";
import { createAuthService, type AuthService } from "./auth.service.js";

/**
 * Dez tentativas por minuto, por IP e conta alvo. Suficiente para quem esqueceu
 * a senha, curto para quem está varrendo senhas.
 */
const defaultLoginLimiter = rateLimit({
  scope: "login",
  max: 10,
  windowSeconds: 60,
  identify: byIpAndEmail,
});

const defaultRegisterLimiter = rateLimit({
  scope: "register",
  max: 5,
  windowSeconds: 300,
});

export interface AuthRouterOptions {
  /**
   * Limitadores injetáveis. O teste de regra de autenticação passa
   * passa-adiante: ele registra várias contas do mesmo IP em sequência, e
   * brigar com o limitador testaria a infraestrutura, não a regra. O
   * comportamento do limitador tem teste próprio.
   */
  readonly loginLimiter?: RequestHandler;
  readonly registerLimiter?: RequestHandler;
}

/**
 * O service entra por parâmetro para que o teste possa montar as rotas sobre um
 * repositório falso; em produção, o padrão é o de Prisma.
 */
export function createAuthRouter(
  service: AuthService = createAuthService(createAuthRepository()),
  options: AuthRouterOptions = {},
): Router {
  const router = Router();
  const controller = createAuthController(service);
  const limitarTentativas = options.loginLimiter ?? defaultLoginLimiter;
  const limitarCadastros = options.registerLimiter ?? defaultRegisterLimiter;

  router.post(
    "/auth/register",
    limitarCadastros,
    validate({ body: registerSchema }),
    controller.register,
  );
  router.post(
    "/auth/login",
    limitarTentativas,
    validate({ body: loginSchema }),
    controller.login,
  );

  // Público de propósito: quem chama tem o token de renovação justamente
  // porque o de acesso já expirou
  router.post(
    "/auth/refresh",
    validate({ body: refreshSchema }),
    controller.refresh,
  );

  router.post(
    "/auth/logout",
    authenticate,
    validate({ body: refreshSchema }),
    controller.logout,
  );
  router.get("/auth/me", authenticate, controller.me);

  return router;
}
