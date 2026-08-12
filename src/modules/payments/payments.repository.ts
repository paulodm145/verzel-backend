import { randomUUID } from "node:crypto";

import type { PrismaClient } from "../../generated/prisma/client.js";
import type { PaymentStatus } from "../../generated/prisma/enums.js";
import { prisma as sharedPrisma } from "../../shared/lib/prisma.js";
import {
  generateTicketCode,
  signTicketPayload,
} from "../tickets/qrcode.service.js";

export interface PaymentRecord {
  readonly id: string;
  readonly reservationId: string;
  readonly status: PaymentStatus;
  readonly simulatedAt: Date;
}

export interface PaymentsRepository {
  /**
   * Registra o pagamento e, se aprovado, confirma a reserva **e emite o
   * ingresso** na mesma transação: pagamento aprovado com reserva pendente, ou
   * confirmada sem ingresso, seria um cliente cobrado sem entrada.
   */
  record(
    reservationId: string,
    status: PaymentStatus,
    confirmReservation: boolean,
  ): Promise<PaymentRecord>;
}

/**
 * O id do ingresso é sorteado antes da transação porque ele entra no payload
 * assinado: a assinatura precisa do id, e o id precisa estar no registro.
 */
function newTicketData(reservationId: string, eventId: string) {
  const id = randomUUID();
  const code = generateTicketCode();

  return {
    id,
    reservationId,
    code,
    qrSignature: signTicketPayload({ ticketId: id, eventId, code }),
  };
}

export function createPaymentsRepository(
  prisma: PrismaClient = sharedPrisma,
): PaymentsRepository {
  return {
    async record(reservationId, status, confirmReservation) {
      const reservation = confirmReservation
        ? await prisma.reservation.findUniqueOrThrow({
            where: { id: reservationId },
            select: { eventId: true },
          })
        : null;

      const [payment] = await prisma.$transaction([
        // Uma reserva tem no máximo um registro de pagamento: a tentativa
        // recusada é sobrescrita pela seguinte. Simplificação consciente de
        // pagamento simulado (plan 0004)
        prisma.payment.upsert({
          where: { reservationId },
          create: { reservationId, status },
          update: { status, simulatedAt: new Date() },
        }),
        ...(confirmReservation && reservation
          ? [
              prisma.reservation.update({
                where: { id: reservationId },
                data: { status: "CONFIRMED" as const },
              }),
              prisma.ticket.create({
                data: newTicketData(reservationId, reservation.eventId),
              }),
            ]
          : []),
      ]);

      return payment;
    },
  };
}
