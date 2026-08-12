import express, { type Express } from "express";
import swaggerUi from "swagger-ui-express";

import { buildOpenApiDocument } from "./docs/swagger.js";
import { createAuthRouter } from "./modules/auth/auth.routes.js";
import { createCatalogRouter } from "./modules/catalog/catalog.routes.js";
import { createEventsRouter } from "./modules/events/events.routes.js";
import { createGateRouter } from "./modules/gate/gate.routes.js";
import { createHealthRouter } from "./modules/health/health.routes.js";
import { createReservationsRouter } from "./modules/reservations/reservations.routes.js";
import { createTicketsRouter } from "./modules/tickets/tickets.routes.js";
import { cors } from "./shared/middlewares/cors.js";
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
  // Antes de tudo: o preflight precisa ser respondido sem passar por
  // autenticação nem por parser de corpo
  app.use(cors);
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
  app.use(createCatalogRouter());
  app.use(createEventsRouter());
  app.use(createReservationsRouter());
  app.use(createTicketsRouter());
  app.use(createGateRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
