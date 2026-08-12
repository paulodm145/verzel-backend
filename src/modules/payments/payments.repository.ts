import type { PrismaClient } from "../../generated/prisma/client.js";
import type { PaymentStatus } from "../../generated/prisma/enums.js";
import { prisma as sharedPrisma } from "../../shared/lib/prisma.js";

export interface PaymentRecord {
  readonly id: string;
  readonly reservationId: string;
  readonly status: PaymentStatus;
  readonly simulatedAt: Date;
}

export interface PaymentsRepository {
  /**
   * Registra o pagamento e, se aprovado, confirma a reserva na mesma
   * transação: pagamento aprovado com reserva pendente seria um cliente cobrado
   * sem lugar garantido.
   */
  record(
    reservationId: string,
    status: PaymentStatus,
    confirmReservation: boolean,
  ): Promise<PaymentRecord>;
}

export function createPaymentsRepository(
  prisma: PrismaClient = sharedPrisma,
): PaymentsRepository {
  return {
    async record(reservationId, status, confirmReservation) {
      const [payment] = await prisma.$transaction([
        // Uma reserva tem no máximo um registro de pagamento: a tentativa
        // recusada é sobrescrita pela seguinte. Simplificação consciente de
        // pagamento simulado (plan 0004)
        prisma.payment.upsert({
          where: { reservationId },
          create: { reservationId, status },
          update: { status, simulatedAt: new Date() },
        }),
        ...(confirmReservation
          ? [
              prisma.reservation.update({
                where: { id: reservationId },
                data: { status: "CONFIRMED" as const },
              }),
            ]
          : []),
      ]);

      return payment;
    },
  };
}
