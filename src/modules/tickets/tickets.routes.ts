import { Router } from "express";

import { authenticate, getAuth } from "../../shared/middlewares/authenticate.js";
import { requireRole } from "../../shared/middlewares/require-role.js";
import { validate, validated } from "../../shared/middlewares/validate.js";
import { createTicketsRepository } from "./tickets.repository.js";
import { listTicketsSchema, ticketCodeSchema } from "./tickets.schema.js";
import { createTicketsService, type TicketsService } from "./tickets.service.js";

export function createTicketsRouter(
  service: TicketsService = createTicketsService(createTicketsRepository()),
): Router {
  const router = Router();

  router.get(
    "/tickets/mine",
    authenticate,
    requireRole("CUSTOMER"),
    validate({ query: listTicketsSchema }),
    async (request, response) => {
      const { query } = validated(request, { query: listTicketsSchema });

      response.json(await service.listMine(getAuth(request).userId, query));
    },
  );

  // Pública: é o link que o cliente compartilha com quem vai junto
  router.get(
    "/tickets/:code",
    validate({ params: ticketCodeSchema }),
    async (request, response) => {
      const { params } = validated(request, { params: ticketCodeSchema });

      response.json(await service.findByCode(params.code));
    },
  );

  return router;
}
