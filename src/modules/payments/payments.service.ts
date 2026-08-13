import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../shared/errors/index.js";
import type { ReservationsRepository } from "../reservations/reservations.repository.js";
import type { PaymentsRepository } from "./payments.repository.js";
import type { PayReservationInput, PaymentOutput } from "./payments.schema.js";

export interface PaymentsService {
  pay(
    customerId: string,
    reservationId: string,
    input: PayReservationInput,
  ): Promise<PaymentOutput>;
}

export function createPaymentsService(
  payments: PaymentsRepository,
  reservations: ReservationsRepository,
): PaymentsService {
  return {
    /**
     * Pagamento simulado.
     *
     * Aprovado confirma a reserva; recusado a deixa `PENDING`, para o cliente
     * poder tentar de novo até o prazo vencer (RN-8). Reserva vencida,
     * cancelada ou já confirmada recusa o pagamento — pagar de novo o que já
     * está pago é o duplo débito que a idempotência evita no transporte, e que
     * esta regra evita no domínio.
     */
    async pay(customerId, reservationId, input) {
      const reservation = await reservations.findById(reservationId);

      if (!reservation) {
        throw new NotFoundError("Reserva não encontrada");
      }

      if (reservation.customerId !== customerId) {
        throw new ForbiddenError("Esta reserva é de outro cliente");
      }

      if (reservation.status === "CONFIRMED") {
        throw new ConflictError("Esta reserva já foi paga");
      }

      if (reservation.status !== "PENDING") {
        throw new ConflictError("Esta reserva não está mais ativa");
      }

      if (reservation.expiresAt.getTime() <= Date.now()) {
        // Vencida na prática, ainda PENDING no banco: a varredura preguiçosa só
        // roda quando alguém disputa o assento
        throw new ConflictError("O prazo desta reserva venceu");
      }

      // Sem esta checagem, o cliente pagaria por evento cancelado, receberia o
      // ingresso e seria barrado na portaria. Cobrar e depois negar a entrada é
      // o pior desfecho possível deste fluxo.
      const event = await reservations.findEventState(reservation.eventId);

      if (event?.status !== "PUBLISHED") {
        throw new ConflictError(
          "Este evento não está mais disponível para pagamento",
        );
      }

      const approved = input.simulate === "APPROVED";
      const payment = await payments.record(
        reservationId,
        approved ? "APPROVED" : "REFUSED",
        approved,
      );

      return {
        id: payment.id,
        reservationId: payment.reservationId,
        status: payment.status,
        simulatedAt: payment.simulatedAt.toISOString(),
        reservationStatus: approved ? "CONFIRMED" : "PENDING",
      };
    },
  };
}
