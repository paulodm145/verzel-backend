import { z } from "zod";

/**
 * O `eventId` é obrigatório porque é ele que torna `WRONG_EVENT` possível: sem
 * saber em que porta o leitor está, um ingresso de outro evento seria
 * indistinguível de um ingresso legítimo (RN-5).
 */
export const validateTicketSchema = z
  .object({
    qrContent: z.string().min(1).optional(),
    code: z.string().trim().toUpperCase().min(4).max(40).optional(),
    eventId: z.uuid(),
  })
  .refine((body) => Boolean(body.qrContent ?? body.code), {
    message: "Informe o conteúdo do QR ou o código do ingresso",
  });

export const gateTicketCodeSchema = z.object({
  code: z.string().trim().toUpperCase().min(4).max(40),
});

export const gateInspectQuerySchema = z.object({
  eventId: z.uuid().optional(),
});

export const validationResultSchema = z.object({
  result: z.enum(["VALID", "INVALID", "ALREADY_USED", "WRONG_EVENT"]),
  /** Em português: vai direto para a tela de quem está na porta. */
  message: z.string(),
  ticket: z
    .object({
      code: z.string(),
      seatLabel: z.string(),
      eventTitle: z.string(),
    })
    .nullable(),
  usedAt: z.iso.datetime().nullable(),
});

export type ValidateTicketInput = z.infer<typeof validateTicketSchema>;
export type ValidationResult = z.infer<typeof validationResultSchema>;
