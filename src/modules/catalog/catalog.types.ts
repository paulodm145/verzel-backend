import type { SourceType } from "../../generated/prisma/enums.js";

/**
 * Item de catálogo já normalizado. Nada aqui lembra a API de origem: é isso que
 * permite trocar de provedor sem tocar em regra de negócio (ADR 0005).
 */
export interface CatalogItem {
  readonly externalId: string;
  readonly title: string;
  readonly sourceType: SourceType;
  /** Nem todo item tem data — filme sem lançamento definido, por exemplo. */
  readonly date: string | null;
  readonly imageUrl: string | null;
  readonly description: string | null;
  /** Qual adapter respondeu. Útil ao organizador e ao diagnóstico. */
  readonly provider: string;
}

export interface CatalogSearchParams {
  readonly query: string;
  readonly page: number;
}
