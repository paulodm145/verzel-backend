import type { Request, RequestHandler, Response } from "express";

import { getAuth } from "../../shared/middlewares/authenticate.js";
import { validated } from "../../shared/middlewares/validate.js";
import {
  createEventSchema,
  eventIdSchema,
  listEventsSchema,
  updateEventSchema,
} from "./events.schema.js";
import type { EventsService } from "./events.service.js";

export interface EventsController {
  readonly create: RequestHandler;
  readonly update: RequestHandler;
  readonly publish: RequestHandler;
  readonly cancel: RequestHandler;
  readonly listPublic: RequestHandler;
  readonly listMine: RequestHandler;
  readonly detail: RequestHandler;
}

export function createEventsController(
  service: EventsService,
): EventsController {
  return {
    async create(request: Request, response: Response) {
      const { body } = validated(request, { body: createEventSchema });

      response
        .status(201)
        .json(await service.create(getAuth(request).userId, body));
    },

    async update(request: Request, response: Response) {
      const { body, params } = validated(request, {
        body: updateEventSchema,
        params: eventIdSchema,
      });

      response.json(
        await service.update(getAuth(request).userId, params.id, body),
      );
    },

    async publish(request: Request, response: Response) {
      const { params } = validated(request, { params: eventIdSchema });

      response.json(await service.publish(getAuth(request).userId, params.id));
    },

    async cancel(request: Request, response: Response) {
      const { params } = validated(request, { params: eventIdSchema });

      response.json(await service.cancel(getAuth(request).userId, params.id));
    },

    async listPublic(request: Request, response: Response) {
      const { query } = validated(request, { query: listEventsSchema });
      const page = await service.listPublished(query);

      response.json({ ...page, skip: query.skip, take: query.take });
    },

    async listMine(request: Request, response: Response) {
      const { query } = validated(request, { query: listEventsSchema });
      const page = await service.listOwned(getAuth(request).userId, query);

      response.json({ ...page, skip: query.skip, take: query.take });
    },

    async detail(request: Request, response: Response) {
      const { params } = validated(request, { params: eventIdSchema });

      response.json(await service.detail(params.id));
    },
  };
}
