import { z } from "zod";

/**
 * O teto de 500 na capacidade não é arbitrário: cada unidade vira uma linha em
 * `Seat`, criada na mesma transação do evento. Mapa gigante é o caminho curto
 * para segurar o banco durante a avaliação.
 */
export const createEventSchema = z.object({
  externalId: z.string().min(1).max(120),
  sourceType: z.enum(["SHOW", "MOVIE"]),
  title: z.string().trim().min(2).max(200),
  description: z.string().max(2000).nullish(),
  imageUrl: z.url().max(500).nullish(),
  date: z.iso.datetime(),
  venue: z.string().trim().min(2).max(200),
  capacity: z.number().int().min(1).max(500),
  price: z.number().nonnegative().max(1_000_000),
});

/**
 * `externalId` e `sourceType` ficam de fora: mudar a origem de um evento já
 * criado seria outro evento, não uma edição.
 */
export const updateEventSchema = createEventSchema
  .omit({ externalId: true, sourceType: true })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: "Informe ao menos um campo para alterar",
  });

export const listEventsSchema = z.object({
  /**
   * Busca vazia é o mesmo que não buscar. Um campo de texto no frontend manda
   * `?search=` assim que o usuário limpa o que digitou, e recusar isso com 400
   * obrigaria o cliente a montar a query condicionalmente — trabalho que a
   * borda resolve melhor.
   */
  search: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().min(1).max(200).optional(),
  ),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(50).default(20),
});

export const eventIdSchema = z.object({ id: z.uuid() });

export const eventSchema = z.object({
  id: z.uuid(),
  organizerId: z.uuid(),
  sourceType: z.enum(["SHOW", "MOVIE"]),
  externalId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  date: z.iso.datetime(),
  venue: z.string(),
  capacity: z.number().int(),
  price: z.number(),
  status: z.enum(["DRAFT", "PUBLISHED", "CANCELED"]),
  createdAt: z.iso.datetime(),
});

export const eventDetailSchema = eventSchema.extend({
  availableSeatsCount: z.number().int().nonnegative(),
});

export const seatSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  available: z.boolean(),
});

export const seatMapSchema = z.object({
  items: z.array(seatSchema),
  total: z.number().int().nonnegative(),
  availableCount: z.number().int().nonnegative(),
});

export const eventListSchema = z.object({
  items: z.array(eventSchema),
  total: z.number().int().nonnegative(),
  skip: z.number().int().nonnegative(),
  take: z.number().int().positive(),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type ListEventsInput = z.infer<typeof listEventsSchema>;
export type EventOutput = z.infer<typeof eventSchema>;
export type EventDetailOutput = z.infer<typeof eventDetailSchema>;
export type SeatMapOutput = z.infer<typeof seatMapSchema>;
