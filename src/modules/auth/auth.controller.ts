import type { Request, RequestHandler, Response } from "express";

import { getAuth } from "../../shared/middlewares/authenticate.js";
import { validated } from "../../shared/middlewares/validate.js";
import type { AuthService } from "./auth.service.js";
import { loginSchema, refreshSchema, registerSchema } from "./auth.schema.js";

export interface AuthController {
  readonly register: RequestHandler;
  readonly login: RequestHandler;
  readonly refresh: RequestHandler;
  readonly logout: RequestHandler;
  readonly me: RequestHandler;
}

/**
 * Traduz HTTP para o service e de volta, sem regra própria. Erros sobem para o
 * handler central — em Express 5, promessa rejeitada em handler `async` chega lá
 * sozinha, sem try/catch.
 */
export function createAuthController(service: AuthService): AuthController {
  return {
    async register(request: Request, response: Response) {
      const { body } = validated(request, { body: registerSchema });

      response.status(201).json(await service.register(body));
    },

    async login(request: Request, response: Response) {
      const { body } = validated(request, { body: loginSchema });

      response.json(await service.login(body));
    },

    async refresh(request: Request, response: Response) {
      const { body } = validated(request, { body: refreshSchema });

      response.json(await service.refresh(body.refreshToken));
    },

    async logout(request: Request, response: Response) {
      const { body } = validated(request, { body: refreshSchema });

      await service.logout(body.refreshToken);
      response.status(204).send();
    },

    async me(request: Request, response: Response) {
      response.json(await service.profile(getAuth(request).userId));
    },
  };
}
