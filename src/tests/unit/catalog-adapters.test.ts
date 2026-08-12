import { describe, expect, it } from "vitest";

import { createTicketmasterAdapter } from "../../modules/catalog/adapters/ticketmaster.adapter.js";
import { createTmdbAdapter } from "../../modules/catalog/adapters/tmdb.adapter.js";
import type { FetchLike } from "../../modules/catalog/catalog.port.js";

/** Payload reduzido ao que o adapter lê, com os campos no formato real. */
const tmdbPayload = {
  results: [
    {
      id: 550,
      title: "Clube da Luta",
      overview: "Um funcionário insone e um vendedor de sabonetes.",
      poster_path: "/abc123.jpg",
      release_date: "1999-10-15",
    },
    { id: 551, title: "Sem imagem nem data" },
  ],
};

const ticketmasterPayload = {
  _embedded: {
    events: [
      {
        id: "G5vYZ9a1bC",
        name: "Show da Banda",
        info: "Turnê 2026",
        images: [
          { url: "https://exemplo.test/pequena.jpg", width: 100 },
          { url: "https://exemplo.test/grande.jpg", width: 1024 },
        ],
        dates: { start: { dateTime: "2026-11-20T23:00:00Z" } },
      },
      {
        id: "G5vYZ9a1bD",
        name: "Show só com data local",
        dates: { start: { localDate: "2026-12-01" } },
      },
    ],
  },
};

function fetchReturning(payload: unknown, ok = true): FetchLike {
  return () =>
    Promise.resolve({
      ok,
      json: () => Promise.resolve(payload),
    } as Response);
}

describe("adapter do TMDb", () => {
  const adapter = createTmdbAdapter({
    apiKey: "chave",
    timeoutMs: 1000,
    fetchImpl: fetchReturning(tmdbPayload),
  });

  it("traduz para o contrato comum", async () => {
    const [primeiro] = await adapter.search({ query: "clube", page: 1 });

    expect(primeiro).toEqual({
      externalId: "550",
      title: "Clube da Luta",
      sourceType: "MOVIE",
      date: "1999-10-15T00:00:00.000Z",
      imageUrl: "https://image.tmdb.org/t/p/w500/abc123.jpg",
      description: "Um funcionário insone e um vendedor de sabonetes.",
      provider: "tmdb",
    });
  });

  it("aceita item sem imagem e sem data", async () => {
    const [, segundo] = await adapter.search({ query: "clube", page: 1 });

    expect(segundo).toMatchObject({ imageUrl: null, date: null });
  });

  it("manda a chave e a busca na query string", async () => {
    const urls: string[] = [];
    const espiao = createTmdbAdapter({
      apiKey: "chave-secreta",
      timeoutMs: 1000,
      fetchImpl: (url) => {
        urls.push(url);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(tmdbPayload),
        } as Response);
      },
    });

    await espiao.search({ query: "clube da luta", page: 2 });

    expect(urls[0]).toContain("api_key=chave-secreta");
    expect(urls[0]).toContain("page=2");
  });

  it("devolve lista vazia quando a API responde erro", async () => {
    const comErro = createTmdbAdapter({
      apiKey: "chave",
      timeoutMs: 1000,
      fetchImpl: fetchReturning({ status_message: "inválida" }, false),
    });

    await expect(comErro.search({ query: "x", page: 1 })).resolves.toEqual([]);
    await expect(comErro.getById("550")).resolves.toBeNull();
  });
});

describe("adapter do Ticketmaster", () => {
  const adapter = createTicketmasterAdapter({
    apiKey: "chave",
    timeoutMs: 1000,
    fetchImpl: fetchReturning(ticketmasterPayload),
  });

  it("desembrulha _embedded e escolhe a maior imagem", async () => {
    const [primeiro] = await adapter.search({ query: "banda", page: 1 });

    expect(primeiro).toEqual({
      externalId: "G5vYZ9a1bC",
      title: "Show da Banda",
      sourceType: "SHOW",
      date: "2026-11-20T23:00:00.000Z",
      imageUrl: "https://exemplo.test/grande.jpg",
      description: "Turnê 2026",
      provider: "ticketmaster",
    });
  });

  it("aceita evento que só tem data local", async () => {
    const [, segundo] = await adapter.search({ query: "banda", page: 1 });

    expect(segundo?.date).toBe("2026-12-01T00:00:00.000Z");
  });

  it("converte a paginação: o contrato começa em um, a API em zero", async () => {
    const urls: string[] = [];
    const espiao = createTicketmasterAdapter({
      apiKey: "chave",
      timeoutMs: 1000,
      fetchImpl: (url) => {
        urls.push(url);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(ticketmasterPayload),
        } as Response);
      },
    });

    await espiao.search({ query: "banda", page: 1 });

    expect(urls[0]).toContain("page=0");
  });

  it("devolve lista vazia quando a API responde erro", async () => {
    const comErro = createTicketmasterAdapter({
      apiKey: "chave",
      timeoutMs: 1000,
      fetchImpl: fetchReturning({ fault: "chave inválida" }, false),
    });

    await expect(comErro.search({ query: "x", page: 1 })).resolves.toEqual([]);
  });
});

describe("os dois adapters", () => {
  it("produzem o mesmo formato a partir de APIs diferentes", async () => {
    const tmdb = createTmdbAdapter({
      apiKey: "k",
      timeoutMs: 1000,
      fetchImpl: fetchReturning(tmdbPayload),
    });
    const ticketmaster = createTicketmasterAdapter({
      apiKey: "k",
      timeoutMs: 1000,
      fetchImpl: fetchReturning(ticketmasterPayload),
    });

    const [doTmdb] = await tmdb.search({ query: "x", page: 1 });
    const [doTicketmaster] = await ticketmaster.search({ query: "x", page: 1 });

    expect(Object.keys(doTmdb ?? {}).sort()).toEqual(
      Object.keys(doTicketmaster ?? {}).sort(),
    );
  });
});
