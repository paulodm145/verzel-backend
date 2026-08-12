import { describe, expect, it } from "vitest";

import { createCatalogProviders } from "../../modules/catalog/catalog.factory.js";
import type { CatalogProvider } from "../../modules/catalog/catalog.port.js";
import {
  createCatalogService,
  type CatalogCache,
} from "../../modules/catalog/catalog.service.js";
import type { CatalogItem } from "../../modules/catalog/catalog.types.js";

function itemOf(provider: string, id: string): CatalogItem {
  return {
    externalId: id,
    title: `Item ${id}`,
    sourceType: provider === "tmdb" ? "MOVIE" : "SHOW",
    date: null,
    imageUrl: null,
    description: null,
    provider,
  };
}

function fakeProvider(
  name: string,
  behaviour: "ok" | "falha" = "ok",
): CatalogProvider & { calls: number } {
  const provider = {
    name,
    sourceType: name === "tmdb" ? ("MOVIE" as const) : ("SHOW" as const),
    calls: 0,
    search() {
      provider.calls += 1;

      return behaviour === "ok"
        ? Promise.resolve([itemOf(name, "1")])
        : Promise.reject(new Error("provedor fora do ar"));
    },
    getById() {
      return Promise.resolve(null);
    },
  };

  return provider;
}

function memoryCache(): CatalogCache & { writes: number } {
  const entries = new Map<string, CatalogItem[]>();

  return {
    writes: 0,
    read(key) {
      return Promise.resolve(entries.get(key) ?? null);
    },
    write(key, items) {
      this.writes += 1;
      entries.set(key, items);

      return Promise.resolve();
    },
  };
}

/** Cache que sempre falha, como um Redis fora do ar. */
const brokenCache: CatalogCache = {
  read: () => Promise.resolve(null),
  write: () => Promise.resolve(),
};

describe("catalog.factory", () => {
  it("não instancia provedor sem chave", () => {
    expect(createCatalogProviders({ timeoutMs: 1000 })).toEqual([]);
  });

  it("instancia só o provedor cuja chave existe", () => {
    const providers = createCatalogProviders({
      tmdbApiKey: "k",
      timeoutMs: 1000,
    });

    expect(providers.map((provider) => provider.name)).toEqual(["tmdb"]);
  });

  it("instancia os dois quando as duas chaves existem", () => {
    const providers = createCatalogProviders({
      tmdbApiKey: "k",
      ticketmasterApiKey: "k",
      timeoutMs: 1000,
    });

    expect(providers.map((provider) => provider.name)).toEqual([
      "tmdb",
      "ticketmaster",
    ]);
  });
});

describe("catalog.service", () => {
  it("responde vazio, e não erro, quando não há provedor configurado", async () => {
    const service = createCatalogService([], memoryCache());

    await expect(service.search({ query: "x", page: 1 })).resolves.toEqual([]);
  });

  it("junta os resultados dos provedores", async () => {
    const service = createCatalogService(
      [fakeProvider("tmdb"), fakeProvider("ticketmaster")],
      memoryCache(),
    );

    const items = await service.search({ query: "x", page: 1 });

    expect(items.map((item) => item.provider)).toEqual([
      "tmdb",
      "ticketmaster",
    ]);
  });

  it("não chama o provedor de novo dentro do TTL", async () => {
    const provider = fakeProvider("tmdb");
    const service = createCatalogService([provider], memoryCache());

    await service.search({ query: "x", page: 1 });
    await service.search({ query: "x", page: 1 });

    expect(provider.calls).toBe(1);
  });

  it("trata busca diferente como chave diferente", async () => {
    const provider = fakeProvider("tmdb");
    const service = createCatalogService([provider], memoryCache());

    await service.search({ query: "x", page: 1 });
    await service.search({ query: "y", page: 1 });

    expect(provider.calls).toBe(2);
  });

  it("devolve o que sobrou quando um provedor falha", async () => {
    const service = createCatalogService(
      [fakeProvider("tmdb", "falha"), fakeProvider("ticketmaster")],
      memoryCache(),
    );

    const items = await service.search({ query: "x", page: 1 });

    expect(items.map((item) => item.provider)).toEqual(["ticketmaster"]);
  });

  it("segue funcionando com o cache fora do ar", async () => {
    const provider = fakeProvider("tmdb");
    const service = createCatalogService([provider], brokenCache);

    await expect(service.search({ query: "x", page: 1 })).resolves.toHaveLength(
      1,
    );
    await service.search({ query: "x", page: 1 });

    // Sem cache, cada busca vai ao provedor — degradação, não falha
    expect(provider.calls).toBe(2);
  });
});
