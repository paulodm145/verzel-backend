import { z } from "zod";

export const createReservationSchema = z.object({
  seatId: z.uuid(),
});

export const reservationIdSchema = z.object({ id: z.uuid() });

export const listReservationsSchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(50).default(20),
});

export const reservationSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  customerId: z.uuid(),
  seatId: z.uuid(),
  seatLabel: z.string(),
  status: z.enum(["PENDING", "CONFIRMED", "EXPIRED", "CANCELED"]),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});

export const reservationListSchema = z.object({
  items: z.array(reservationSchema),
  total: z.number().int().nonnegative(),
  skip: z.number().int().nonnegative(),
  take: z.number().int().positive(),
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;
export type ReservationOutput = z.infer<typeof reservationSchema>;
