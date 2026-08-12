import { z } from "zod";

export const ticketCodeSchema = z.object({
  code: z.string().trim().toUpperCase().min(4).max(40),
});

export const listTicketsSchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(50).default(20),
});

const ticketEventSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  date: z.iso.datetime(),
  venue: z.string(),
});

/**
 * Visão pública do ingresso: é o que o link compartilhado entrega. Não traz
 * nome nem e-mail do comprador — repassar um ingresso não deveria repassar os
 * dados de quem o comprou (RN-7).
 */
export const publicTicketSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  status: z.enum(["VALID", "USED"]),
  qrContent: z.string(),
  seatLabel: z.string(),
  usedAt: z.iso.datetime().nullable(),
  event: ticketEventSchema,
});

export const ticketSchema = publicTicketSchema.extend({
  shareUrl: z.url(),
});

export const ticketListSchema = z.object({
  items: z.array(ticketSchema),
  total: z.number().int().nonnegative(),
});

export type TicketOutput = z.infer<typeof ticketSchema>;
export type PublicTicketOutput = z.infer<typeof publicTicketSchema>;
