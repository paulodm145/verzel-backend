import { Router } from "express";

import { authenticate } from "../../shared/middlewares/authenticate.js";
import { getAuth } from "../../shared/middlewares/authenticate.js";
import { idempotent } from "../../shared/middlewares/idempotency.js";
import { requireRole } from "../../shared/middlewares/require-role.js";
import { validate, validated } from "../../shared/middlewares/validate.js";
import { createPaymentsRepository } from "../payments/payments.repository.js";
import { payReservationSchema } from "../payments/payments.schema.js";
import {
  createPaymentsService,
  type PaymentsService,
} from "../payments/payments.service.js";
import { eventIdSchema } from "../events/events.schema.js";
import {
  createReservationsRepository,
  type ReservationsRepository,
} from "./reservations.repository.js";
import {
  createReservationSchema,
  listReservationsSchema,
  reservationIdSchema,
} from "./reservations.schema.js";
import {
  createReservationsService,
  type ReservationsService,
} from "./reservations.service.js";

export interface ReservationsRouterDependencies {
  readonly reservations?: ReservationsService;
  readonly payments?: PaymentsService;
}

export function createReservationsRouter(
  dependencies: ReservationsRouterDependencies = {},
): Router {
  const repository: ReservationsRepository = createReservationsRepository();
  const reservations =
    dependencies.reservations ?? createReservationsService(repository);
  const payments =
    dependencies.payments ??
    createPaymentsService(createPaymentsRepository(), repository);

  const router = Router();
  const customerOnly = [authenticate, requireRole("CUSTOMER")];

  router.post(
    "/events/:id/reservations",
    ...customerOnly,
    idempotent("reservation"),
    validate({ params: eventIdSchema, body: createReservationSchema }),
    async (request, response) => {
      const { params, body } = validated(request, {
        params: eventIdSchema,
        body: createReservationSchema,
      });

      response
        .status(201)
        .json(
          await reservations.reserve(
            getAuth(request).userId,
            params.id,
            body.seatId,
          ),
        );
    },
  );

  router.get(
    "/reservations/mine",
    ...customerOnly,
    validate({ query: listReservationsSchema }),
    async (request, response) => {
      const { query } = validated(request, { query: listReservationsSchema });

      const page = await reservations.listMine(getAuth(request).userId, query);

      response.json({ ...page, skip: query.skip, take: query.take });
    },
  );

  router.delete(
    "/reservations/:id",
    ...customerOnly,
    validate({ params: reservationIdSchema }),
    async (request, response) => {
      const { params } = validated(request, { params: reservationIdSchema });

      response.json(
        await reservations.cancel(getAuth(request).userId, params.id),
      );
    },
  );

  router.post(
    "/reservations/:id/payment",
    ...customerOnly,
    idempotent("payment"),
    validate({ params: reservationIdSchema, body: payReservationSchema }),
    async (request, response) => {
      const { params, body } = validated(request, {
        params: reservationIdSchema,
        body: payReservationSchema,
      });

      response.json(
        await payments.pay(getAuth(request).userId, params.id, body),
      );
    },
  );

  return router;
}
