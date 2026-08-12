import { Router } from "express";

import { authenticate, getAuth } from "../../shared/middlewares/authenticate.js";
import { requireRole } from "../../shared/middlewares/require-role.js";
import { validate, validated } from "../../shared/middlewares/validate.js";
import { createGateRepository } from "./gate.repository.js";
import { gateTicketCodeSchema, validateTicketSchema } from "./gate.schema.js";
import { createGateService, type GateService } from "./gate.service.js";

export function createGateRouter(
  service: GateService = createGateService(createGateRepository()),
): Router {
  const router = Router();
  const gateOnly = [authenticate, requireRole("GATE")];

  router.post(
    "/gate/validate",
    ...gateOnly,
    validate({ body: validateTicketSchema }),
    async (request, response) => {
      const { body } = validated(request, { body: validateTicketSchema });

      // Sempre 200: a portaria precisa de um resultado para mostrar, não de um
      // erro HTTP para tratar. Ingresso inválido é resposta, não falha.
      response.json(await service.validate(getAuth(request).userId, body));
    },
  );

  router.get(
    "/gate/tickets/:code",
    ...gateOnly,
    validate({ params: gateTicketCodeSchema }),
    async (request, response) => {
      const { params } = validated(request, { params: gateTicketCodeSchema });

      response.json(await service.inspect(params.code));
    },
  );

  return router;
}
