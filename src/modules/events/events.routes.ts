import { Router } from "express";

import { authenticate } from "../../shared/middlewares/authenticate.js";
import { requireRole } from "../../shared/middlewares/require-role.js";
import { validate } from "../../shared/middlewares/validate.js";
import { createEventsController } from "./events.controller.js";
import { createEventsRepository } from "./events.repository.js";
import {
  createEventSchema,
  eventIdSchema,
  listEventsSchema,
  updateEventSchema,
} from "./events.schema.js";
import { createEventsService, type EventsService } from "./events.service.js";

export function createEventsRouter(
  service: EventsService = createEventsService(createEventsRepository()),
): Router {
  const router = Router();
  const controller = createEventsController(service);
  const organizerOnly = [authenticate, requireRole("ORGANIZER")];

  router.post(
    "/events",
    ...organizerOnly,
    validate({ body: createEventSchema }),
    controller.create,
  );

  // Antes de /events/:id de propósito: registrada depois, a rota de detalhe
  // capturaria "mine" como se fosse um id
  router.get(
    "/events/mine",
    ...organizerOnly,
    validate({ query: listEventsSchema }),
    controller.listMine,
  );

  router.patch(
    "/events/:id",
    ...organizerOnly,
    validate({ body: updateEventSchema, params: eventIdSchema }),
    controller.update,
  );
  router.post(
    "/events/:id/publish",
    ...organizerOnly,
    validate({ params: eventIdSchema }),
    controller.publish,
  );
  router.post(
    "/events/:id/cancel",
    ...organizerOnly,
    validate({ params: eventIdSchema }),
    controller.cancel,
  );

  // Públicas: o cliente navega sem se autenticar
  router.get(
    "/events",
    validate({ query: listEventsSchema }),
    controller.listPublic,
  );
  router.get(
    "/events/:id",
    validate({ params: eventIdSchema }),
    controller.detail,
  );

  return router;
}
