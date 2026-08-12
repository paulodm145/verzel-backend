import type { CatalogProvider, FetchLike } from "../catalog.port.js";
import type { CatalogItem, CatalogSearchParams } from "../catalog.types.js";

const BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

interface TmdbMovie {
  readonly id: number;
  readonly title?: string;
  readonly name?: string;
  readonly overview?: string;
  readonly poster_path?: string | null;
  readonly release_date?: string;
}

interface TmdbSearchResponse {
  readonly results?: readonly TmdbMovie[];
}

export interface TmdbAdapterOptions {
  readonly apiKey: string;
  readonly timeoutMs: number;
  readonly fetchImpl?: FetchLike;
}

/**
 * Data do TMDb vem como `YYYY-MM-DD`, sem hora. Normalizamos para ISO com hora
 * zero em UTC, para o contrato não misturar dois formatos de data.
 */
function toIsoDate(releaseDate: string | undefined): string | null {
  if (!releaseDate) {
    return null;
  }

  const parsed = new Date(`${releaseDate}T00:00:00.000Z`);

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toCatalogItem(movie: TmdbMovie): CatalogItem {
  return {
    externalId: String(movie.id),
    title: movie.title ?? movie.name ?? "Sem título",
    sourceType: "MOVIE",
    date: toIsoDate(movie.release_date),
    imageUrl: movie.poster_path ? `${IMAGE_BASE_URL}${movie.poster_path}` : null,
    description: movie.overview ?? null,
    provider: "tmdb",
  };
}

/**
 * Adapter do TMDb. Toda particularidade da API — nome de campo, base da imagem,
 * formato de data, autenticação por query string — fica presa aqui dentro.
 */
export function createTmdbAdapter(
  options: TmdbAdapterOptions,
): CatalogProvider {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request<T>(path: string, params: URLSearchParams): Promise<T | null> {
    params.set("api_key", options.apiKey);

    const response = await fetchImpl(`${BASE_URL}${path}?${params.toString()}`, {
      signal: AbortSignal.timeout(options.timeoutMs),
      headers: { accept: "application/json" },
    });

    // Erro do provedor não é erro nosso: quem chama trata a ausência de
    // resultado, e o service segue com os demais provedores (RN-4)
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  }

  return {
    name: "tmdb",
    sourceType: "MOVIE",

    async search({ query, page }: CatalogSearchParams) {
      const body = await request<TmdbSearchResponse>(
        "/search/movie",
        new URLSearchParams({ query, page: String(page), language: "pt-BR" }),
      );

      return (body?.results ?? []).map(toCatalogItem);
    },

    async getById(externalId: string) {
      const movie = await request<TmdbMovie>(
        `/movie/${externalId}`,
        new URLSearchParams({ language: "pt-BR" }),
      );

      return movie ? toCatalogItem(movie) : null;
    },
  };
}
