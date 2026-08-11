import express, { type Express } from "express";

import { createHealthRouter } from "./modules/health/health.routes.js";
import { errorHandler } from "./shared/middlewares/error-handler.js";
import { notFoundHandler } from "./shared/middlewares/not-found.js";
import { requestId } from "./shared/middlewares/request-id.js";

/**
 * Monta a aplicação sem abrir porta. Separado de `server.ts` para que o teste de
 * integração exercite as rotas de verdade sem subir um servidor.
 */
export function createApp(): Express {
  const app = express();

  // Não anunciar a tecnologia do servidor
  app.disable("x-powered-by");

  app.use(requestId);
  // Limite explícito: sem ele o padrão de 100kb vira uma surpresa silenciosa,
  // e um limite alto demais é superfície de abuso
  app.use(express.json({ limit: "100kb" }));

  app.use(createHealthRouter());

  // Rotas de domínio entram aqui conforme os épicos avançam

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
