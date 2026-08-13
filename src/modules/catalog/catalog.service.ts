import { getEnv } from "../../shared/config/index.js";
import { getLogger } from "../../shared/lib/logger.js";
import { getRedis } from "../../shared/lib/redis.js";
import type { CatalogProvider } from "./catalog.port.js";
import type { CatalogItem, CatalogSearchParams } from "./catalog.types.js";

export interface CatalogCache {
  read(key: string): Promise<CatalogItem[] | null>;
  write(key: string, items: CatalogItem[], ttlSeconds: number): Promise<void>;
}

export interface CatalogService {
  search(params: CatalogSearchParams): Promise<CatalogItem[]>;
}

/**
 * Cache no Redis, e falhar aqui nunca derruba a busca: o cache é otimização de
 * rate limit, não fonte de verdade. Redis fora do ar significa mais chamadas à
 * API externa, não uma tela de erro (RN-3).
 */
export function createRedisCatalogCache(): CatalogCache {
  return {
    async read(key) {
      try {
        const redis = await getRedis();
        const cached = await redis.get(key);

        return cached ? (JSON.parse(cached) as CatalogItem[]) : null;
      } catch {
        return null;
      }
    },

    async write(key, items, ttlSeconds) {
      try {
        const redis = await getRedis();
        await redis.set(key, JSON.stringify(items), { expiration: { type: "EX", value: ttlSeconds } });
      } catch {
        // Busca cacheada é conforto; perder o registro não afeta a resposta
      }
    },
  };
}

/**
 * A chave inclui quais provedores estão ativos: sem isso, ligar a chave do
 * Ticketmaster serviria por até dez minutos um resultado cacheado que só tem
 * filmes do TMDb.
 */
function cacheKeyOf(
  params: CatalogSearchParams,
  providers: readonly CatalogProvider[],
): string {
  const nomes = providers
    .map((provider) => provider.name)
    .sort()
    .join("+");

  return `catalog:search:${nomes}:${params.query.toLowerCase()}:${String(params.page)}`;
}

export function createCatalogService(
  providers: readonly CatalogProvider[],
  cache: CatalogCache = createRedisCatalogCache(),
): CatalogService {
  return {
    /**
     * Agrega os provedores configurados.
     *
     * `allSettled` e não `all`: provedor que falha ou estoura o prazo sai do
     * resultado, e os demais continuam valendo. Com `all`, um Ticketmaster
     * instável apagaria também os filmes do TMDb (RN-4).
     */
    async search(params) {
      if (providers.length === 0) {
        return [];
      }

      const key = cacheKeyOf(params, providers);
      const cached = await cache.read(key);

      if (cached) {
        return cached;
      }

      const settled = await Promise.allSettled(
        providers.map((provider) => provider.search(params)),
      );

      const items = settled.flatMap((result, index) => {
        if (result.status === "fulfilled") {
          return result.value;
        }

        getLogger().warn(
          { provider: providers[index]?.name, err: result.reason },
          "provedor de catálogo falhou; seguindo com os demais",
        );

        return [];
      });

      await cache.write(key, items, getEnv().CATALOG_CACHE_TTL);

      return items;
    },
  };
}
