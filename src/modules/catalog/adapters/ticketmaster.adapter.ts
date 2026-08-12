import type { CatalogProvider, FetchLike } from "../catalog.port.js";
import type { CatalogItem, CatalogSearchParams } from "../catalog.types.js";

const BASE_URL = "https://app.ticketmaster.com/discovery/v2";

interface TicketmasterImage {
  readonly url?: string;
  readonly width?: number;
}

interface TicketmasterEvent {
  readonly id: string;
  readonly name?: string;
  readonly info?: string;
  readonly description?: string;
  readonly images?: readonly TicketmasterImage[];
  readonly dates?: { readonly start?: { readonly dateTime?: string; readonly localDate?: string } };
}

interface TicketmasterSearchResponse {
  readonly _embedded?: { readonly events?: readonly TicketmasterEvent[] };
}

export interface TicketmasterAdapterOptions {
  readonly apiKey: string;
  readonly timeoutMs: number;
  readonly fetchImpl?: FetchLike;
}

/** A API devolve várias resoluções da mesma imagem; fica a maior. */
function pickLargestImage(
  images: readonly TicketmasterImage[] | undefined,
): string | null {
  const largest = [...(images ?? [])]
    .filter((image) => Boolean(image.url))
    .sort((first, second) => (second.width ?? 0) - (first.width ?? 0))[0];

  return largest?.url ?? null;
}

function toIsoDate(event: TicketmasterEvent): string | null {
  const start = event.dates?.start;
  const raw = start?.dateTime ?? (start?.localDate ? `${start.localDate}T00:00:00.000Z` : undefined);

  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toCatalogItem(event: TicketmasterEvent): CatalogItem {
  return {
    externalId: event.id,
    title: event.name ?? "Sem título",
    sourceType: "SHOW",
    date: toIsoDate(event),
    imageUrl: pickLargestImage(event.images),
    description: event.info ?? event.description ?? null,
    provider: "ticketmaster",
  };
}

/**
 * Adapter do Ticketmaster Discovery. Compare com o do TMDb: paginação começa em
 * zero, os eventos vêm embrulhados em `_embedded`, a data se divide entre
 * `dateTime` e `localDate`, e a imagem vem em várias resoluções. Nada disso
 * vaza para fora deste arquivo.
 */
export function createTicketmasterAdapter(
  options: TicketmasterAdapterOptions,
): CatalogProvider {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request<T>(path: string, params: URLSearchParams): Promise<T | null> {
    params.set("apikey", options.apiKey);

    const response = await fetchImpl(`${BASE_URL}${path}?${params.toString()}`, {
      signal: AbortSignal.timeout(options.timeoutMs),
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  }

  return {
    name: "ticketmaster",
    sourceType: "SHOW",

    async search({ query, page }: CatalogSearchParams) {
      const body = await request<TicketmasterSearchResponse>(
        "/events.json",
        // A paginação da Discovery começa em zero, enquanto o nosso contrato
        // começa em um
        new URLSearchParams({ keyword: query, page: String(Math.max(page - 1, 0)) }),
      );

      return (body?._embedded?.events ?? []).map(toCatalogItem);
    },

    async getById(externalId: string) {
      const event = await request<TicketmasterEvent>(
        `/events/${externalId}.json`,
        new URLSearchParams(),
      );

      return event ? toCatalogItem(event) : null;
    },
  };
}
