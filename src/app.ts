import express, { type Express } from "express";
import swaggerUi from "swagger-ui-express";

import { buildOpenApiDocument } from "./docs/swagger.js";
import { createAuthRouter } from "./modules/auth/auth.routes.js";
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

  const openApiDocument = buildOpenApiDocument();
  app.get("/docs.json", (_request, response) => {
    response.json(openApiDocument);
  });
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

  // Rotas de domínio entram aqui conforme os épicos avançam
  app.use(createAuthRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
