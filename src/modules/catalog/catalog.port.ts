import type { SourceType } from "../../generated/prisma/enums.js";
import type { CatalogItem, CatalogSearchParams } from "./catalog.types.js";

/**
 * Porta do catálogo externo. O service depende disto, nunca de um adapter
 * concreto — a regra do ADR 0005 que o resto do sistema tem de respeitar.
 */
export interface CatalogProvider {
  readonly name: string;
  readonly sourceType: SourceType;
  search(params: CatalogSearchParams): Promise<CatalogItem[]>;
  getById(externalId: string): Promise<CatalogItem | null>;
}

/**
 * `fetch` injetável. Existe para o teste exercitar a tradução sem rede: adapter
 * que só se testa com a internet no ar não se testa.
 */
export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;
