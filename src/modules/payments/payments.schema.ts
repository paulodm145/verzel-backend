import { z } from "zod";

/**
 * O campo `simulate` existe porque o pagamento é simulado: sem gateway real, é
 * ele que permite demonstrar o caminho da recusa. Padrão aprovado, para o fluxo
 * feliz não exigir corpo nenhum.
 */
export const payReservationSchema = z.object({
  paymentMethod: z.enum(["CREDIT_CARD", "PIX"]).default("CREDIT_CARD"),
  simulate: z.enum(["APPROVED", "REFUSED"]).default("APPROVED"),
});

export const paymentSchema = z.object({
  id: z.uuid(),
  reservationId: z.uuid(),
  status: z.enum(["APPROVED", "REFUSED"]),
  simulatedAt: z.iso.datetime(),
  reservationStatus: z.enum(["PENDING", "CONFIRMED", "EXPIRED", "CANCELED"]),
});

export type PayReservationInput = z.infer<typeof payReservationSchema>;
export type PaymentOutput = z.infer<typeof paymentSchema>;
