import { Router } from "express";

import { authenticate } from "../../shared/middlewares/authenticate.js";
import { requireRole } from "../../shared/middlewares/require-role.js";
import { validate, validated } from "../../shared/middlewares/validate.js";
import { createConfiguredProviders } from "./catalog.factory.js";
import { catalogSearchSchema } from "./catalog.schema.js";
import {
  createCatalogService,
  type CatalogService,
} from "./catalog.service.js";

/**
 * Busca restrita ao organizador: é ele quem cria eventos a partir do catálogo, e
 * cada chamada consome cota da API externa. Deixar aberta seria oferecer o nosso
 * rate limit a quem passar.
 */
export function createCatalogRouter(
  service: CatalogService = createCatalogService(createConfiguredProviders()),
): Router {
  const router = Router();

  router.get(
    "/catalog/search",
    authenticate,
    requireRole("ORGANIZER"),
    validate({ query: catalogSearchSchema }),
    async (request, response) => {
      const { query } = validated(request, { query: catalogSearchSchema });

      response.json({ items: await service.search(query) });
    },
  );

  return router;
}
