import { getEnv } from "../../shared/config/index.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../shared/errors/index.js";
import { seatLockKey, withLock, type LockOptions } from "../../shared/lib/lock.js";
import type {
  ReservationRecord,
  ReservationsRepository,
} from "./reservations.repository.js";
import type { ReservationOutput } from "./reservations.schema.js";

export interface ReservationsService {
  reserve(
    customerId: string,
    eventId: string,
    seatId: string,
  ): Promise<ReservationOutput>;
  cancel(customerId: string, reservationId: string): Promise<ReservationOutput>;
  listMine(
    customerId: string,
    pagination: { skip: number; take: number },
  ): Promise<{ items: ReservationOutput[]; total: number }>;
}

export interface ReservationsServiceOptions {
  /** Repassado ao lock; o teste usa para simular Redis fora do ar. */
  readonly lockOptions?: Partial<LockOptions>;
}

function toOutput(
  reservation: ReservationRecord,
  seatLabel: string,
): ReservationOutput {
  return {
    id: reservation.id,
    eventId: reservation.eventId,
    customerId: reservation.customerId,
    seatId: reservation.seatId,
    seatLabel,
    status: reservation.status,
    expiresAt: reservation.expiresAt.toISOString(),
    createdAt: reservation.createdAt.toISOString(),
  };
}

export function createReservationsService(
  repository: ReservationsRepository,
  options: ReservationsServiceOptions = {},
): ReservationsService {
  return {
    /**
     * Reserva um assento, em duas camadas (ADR 0003).
     *
     * O lock evita que duas requisições cheguem juntas ao "verificar e então
     * gravar". A constraint do banco é quem garante — se o lock falhar, ou o
     * Redis estiver fora, a segunda escrita ainda é recusada, e o repositório
     * traduz isso em 409.
     *
     * A expiração acontece aqui, dentro do lock, e não num job: a reserva
     * vencida precisa sair do caminho exatamente quando alguém quer o lugar.
     */
    async reserve(customerId, eventId, seatId) {
      const event = await repository.findEventState(eventId);

      if (!event) {
        throw new NotFoundError("Evento não encontrado");
      }

      if (event.status !== "PUBLISHED") {
        throw new ConflictError(
          "Só é possível reservar assento de evento publicado",
        );
      }

      const seat = await repository.findSeat(seatId);

      // Assento de outro evento é 404, e não 403: para este evento, ele não
      // existe
      if (seat?.eventId !== eventId) {
        throw new NotFoundError("Assento não encontrado neste evento");
      }

      const env = getEnv();

      return withLock(
        seatLockKey(eventId, seatId),
        {
          ttlMs: env.SEAT_LOCK_TTL_MS,
          conflictMessage: "Este assento está sendo reservado agora",
          ...options.lockOptions,
        },
        async () => {
          await repository.expireStaleReservations(seatId);

          const reservation = await repository.create({
            eventId,
            customerId,
            seatId,
            expiresAt: new Date(Date.now() + env.RESERVATION_TTL * 1000),
          });

          return toOutput(reservation, seat.label);
        },
      );
    },

    async cancel(customerId, reservationId) {
      const reservation = await repository.findById(reservationId);

      if (!reservation) {
        throw new NotFoundError("Reserva não encontrada");
      }

      if (reservation.customerId !== customerId) {
        throw new ForbiddenError("Esta reserva é de outro cliente");
      }

      if (reservation.status === "CANCELED") {
        return toOutput(reservation, await seatLabelOf(reservation));
      }

      if (reservation.status !== "PENDING") {
        throw new ConflictError(
          "Só reserva pendente pode ser cancelada pelo cliente",
        );
      }

      const canceled = await repository.updateStatus(reservationId, "CANCELED");

      return toOutput(canceled, await seatLabelOf(canceled));
    },

    async listMine(customerId, pagination) {
      const page = await repository.listByCustomer(customerId, pagination);
      const labels = await repository.findSeatLabels(
        page.items.map((reservation) => reservation.seatId),
      );

      return {
        items: page.items.map((reservation) =>
          toOutput(reservation, labels.get(reservation.seatId) ?? ""),
        ),
        total: page.total,
      };
    },
  };

  async function seatLabelOf(reservation: ReservationRecord): Promise<string> {
    const labels = await repository.findSeatLabels([reservation.seatId]);

    return labels.get(reservation.seatId) ?? "";
  }
}
