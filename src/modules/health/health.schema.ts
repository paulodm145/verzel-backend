import { z } from "zod";

export const serviceStateSchema = z.enum(["up", "down"]);

export const healthReportSchema = z.object({
  status: z.enum(["ok", "degraded", "error"]).meta({
    description:
      "ok: tudo no ar. degraded: Redis fora, o sistema segue correto. " +
      "error: Postgres fora, não há serviço.",
  }),
  services: z.object({
    database: serviceStateSchema,
    cache: serviceStateSchema,
  }),
});

export type HealthReportOutput = z.infer<typeof healthReportSchema>;
