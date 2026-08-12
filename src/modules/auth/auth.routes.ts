import { Router } from "express";

import { authenticate } from "../../shared/middlewares/authenticate.js";
import { validate } from "../../shared/middlewares/validate.js";
import { createAuthController } from "./auth.controller.js";
import { createAuthRepository } from "./auth.repository.js";
import { loginSchema, refreshSchema, registerSchema } from "./auth.schema.js";
import { createAuthService, type AuthService } from "./auth.service.js";

/**
 * O service entra por parâmetro para que o teste possa montar as rotas sobre um
 * repositório falso; em produção, o padrão é o de Prisma.
 */
export function createAuthRouter(
  service: AuthService = createAuthService(createAuthRepository()),
): Router {
  const router = Router();
  const controller = createAuthController(service);

  router.post(
    "/auth/register",
    validate({ body: registerSchema }),
    controller.register,
  );
  router.post("/auth/login", validate({ body: loginSchema }), controller.login);

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
