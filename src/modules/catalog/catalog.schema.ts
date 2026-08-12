import { z } from "zod";

export const catalogSearchSchema = z.object({
  query: z.string().trim().min(2).max(200),
  page: z.coerce.number().int().min(1).max(50).default(1),
});

export const catalogItemSchema = z.object({
  externalId: z.string(),
  title: z.string(),
  sourceType: z.enum(["SHOW", "MOVIE"]),
  date: z.iso.datetime().nullable(),
  imageUrl: z.url().nullable(),
  description: z.string().nullable(),
  provider: z.string(),
});

export const catalogSearchResponseSchema = z.object({
  items: z.array(catalogItemSchema),
});
