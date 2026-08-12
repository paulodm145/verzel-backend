import { getEnv } from "../../shared/config/index.js";
import { createTicketmasterAdapter } from "./adapters/ticketmaster.adapter.js";
import { createTmdbAdapter } from "./adapters/tmdb.adapter.js";
import type { CatalogProvider } from "./catalog.port.js";

export interface ProviderKeys {
  readonly tmdbApiKey?: string | undefined;
  readonly ticketmasterApiKey?: string | undefined;
  readonly timeoutMs: number;
}

/**
 * Decide quais provedores existem, por configuração e não por código.
 *
 * Provedor sem chave simplesmente não é instanciado: quem tiver só a do TMDb
 * roda com um, e quem não tiver nenhuma continua com o sistema de pé — a busca
 * responde vazio em vez de estourar (RN-2). Trocar ou somar fonte é editar o
 * `.env`, que é exatamente o que o ADR 0005 se propôs a permitir.
 */
export function createCatalogProviders(keys: ProviderKeys): CatalogProvider[] {
  const providers: CatalogProvider[] = [];

  if (keys.tmdbApiKey) {
    providers.push(
      createTmdbAdapter({ apiKey: keys.tmdbApiKey, timeoutMs: keys.timeoutMs }),
    );
  }

  if (keys.ticketmasterApiKey) {
    providers.push(
      createTicketmasterAdapter({
        apiKey: keys.ticketmasterApiKey,
        timeoutMs: keys.timeoutMs,
      }),
    );
  }

  return providers;
}

export function createConfiguredProviders(): CatalogProvider[] {
  const env = getEnv();

  return createCatalogProviders({
    tmdbApiKey: env.TMDB_API_KEY,
    ticketmasterApiKey: env.TICKETMASTER_API_KEY,
    timeoutMs: env.CATALOG_TIMEOUT_MS,
  });
}
