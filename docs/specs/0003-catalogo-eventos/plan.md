# Plan 0003 — Catálogo e eventos

Como a [spec 0003](spec.md) será implementada.

## Abordagem

Dois módulos independentes que se encontram num ponto só: `catalog` produz
`CatalogItem` normalizado, e `events` consome esse item para criar um evento
desnormalizado. Depois da criação, `events` não conhece mais o catálogo — é o que
faz a listagem pública sobreviver à API externa fora do ar (RN-5).

O `catalog` segue o [ADR 0005](../../adr/0005-adapter-para-catalogo-externo.md):
`CatalogProvider` como porta, um adapter por API, e a fábrica decidindo por
configuração quais instanciar. **Os dois adapters entram**, porque o valor da
decisão só aparece com mais de um provedor, e porque a fábrica ignora o que não
tiver chave — quem só tiver a do TMDb roda com um, sem tocar em código (RN-2).

A agregação usa `Promise.allSettled`: provedor que falha ou estoura o prazo sai
do resultado sem levar os outros junto (RN-4). Cada adapter tem o seu
`AbortSignal.timeout`.

Em `events`, o mapa de assentos nasce junto do evento, na mesma transação
(RN-7). Sem isso existiria um instante com evento sem assento, e uma falha no
meio deixaria um evento impossível de reservar.

## Arquivos afetados

| Arquivo | Ação | Responsabilidade |
| --- | --- | --- |
| `src/modules/catalog/catalog.types.ts` | criar | `CatalogItem`, `CatalogSearchParams` |
| `src/modules/catalog/catalog.port.ts` | criar | Interface `CatalogProvider` |
| `src/modules/catalog/adapters/tmdb.adapter.ts` | criar | Traduz o TMDb |
| `src/modules/catalog/adapters/ticketmaster.adapter.ts` | criar | Traduz o Ticketmaster |
| `src/modules/catalog/catalog.factory.ts` | criar | Instancia os provedores com chave configurada |
| `src/modules/catalog/catalog.service.ts` | criar | Agrega provedores e cacheia no Redis |
| `src/modules/catalog/catalog.schema.ts` | criar | Zod da busca e do item |
| `src/modules/catalog/catalog.routes.ts` | criar | `GET /catalog/search` |
| `src/modules/events/events.schema.ts` | criar | Zod de criação, edição, filtro e saída |
| `src/modules/events/events.repository.ts` | criar | Prisma de evento e assentos |
| `src/modules/events/events.service.ts` | criar | Regras de dono, estado e mapa de assentos |
| `src/modules/events/events.controller.ts` | criar | HTTP |
| `src/modules/events/events.routes.ts` | criar | Rotas públicas e do organizador |
| `src/shared/config/env.ts` | alterar | Chaves e prazos dos provedores |
| `src/app.ts`, `src/docs/swagger.ts` | alterar | Montagem e documentação |

## Contratos

### Endpoints

| Método | Rota | Papel | Descrição |
| --- | --- | --- | --- |
| `GET` | `/catalog/search?query=&page=` | `ORGANIZER` | Busca no catálogo externo |
| `POST` | `/events` | `ORGANIZER` | Cria evento a partir de item do catálogo |
| `GET` | `/events/mine` | `ORGANIZER` | Eventos do organizador, em qualquer estado |
| `PATCH` | `/events/:id` | `ORGANIZER` dono | Edita rascunho ou dados do evento |
| `POST` | `/events/:id/publish` | `ORGANIZER` dono | `DRAFT` → `PUBLISHED` |
| `POST` | `/events/:id/cancel` | `ORGANIZER` dono | → `CANCELED` |
| `GET` | `/events` | público | Lista publicados, com busca e paginação |
| `GET` | `/events/:id` | público | Detalhe, com assentos disponíveis |

`/events/mine` vem antes de `/events/:id` no roteador: registrada depois, a rota
de detalhe capturaria `mine` como id.

### Contrato do catálogo

```ts
interface CatalogItem {
  externalId: string;
  title: string;
  sourceType: "SHOW" | "MOVIE";
  date: string | null;      // nem todo item do TMDb tem data
  imageUrl: string | null;
  description: string | null;
  provider: string;         // qual adapter respondeu
}

interface CatalogProvider {
  readonly name: string;
  readonly sourceType: "SHOW" | "MOVIE";
  search(params: { query: string; page: number }): Promise<CatalogItem[]>;
  getById(externalId: string): Promise<CatalogItem | null>;
}
```

### Schemas Zod principais

```ts
createEventSchema = z.object({
  externalId: z.string().min(1),
  sourceType: z.enum(["SHOW", "MOVIE"]),
  title: z.string().trim().min(2).max(200),
  description: z.string().max(2000).nullish(),
  imageUrl: z.url().nullish(),
  date: z.iso.datetime(),
  venue: z.string().trim().min(2).max(200),
  capacity: z.number().int().min(1).max(500),
  price: z.number().nonnegative().max(1_000_000),
});

updateEventSchema = createEventSchema.partial().omit({ externalId: true, sourceType: true });
listEventsSchema = z.object({
  search: z.string().trim().min(1).max(200).optional(),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(50).default(20),
});
```

O teto de 500 na capacidade não é arbitrário: cada unidade vira uma linha em
`Seat`, e mapa gigante criado numa transação é o caminho curto para travar o
banco durante a avaliação.

`price` trafega como número e é gravado em `Decimal(10,2)`.

## Modelo de dados

Sem migration nova. `Event` e `Seat` já existem desde a spec 0001, com a chave
única de `Seat (eventId, label)` e a composta `(id, eventId)` que a reserva usa.

Rótulo do assento: `A1`…`A50`, `B1`…, vinte por fileira. Previsível, ordenável e
suficiente para o mapa da interface.

## Estratégia de testes

| Tipo | Alvo | Critérios |
| --- | --- | --- |
| Unitário | adapters, com payload capturado das APIs | CA-1 |
| Unitário | `catalog.service` com provedores falsos | CA-3, CA-4 |
| Unitário | `catalog.factory` | RN-2 |
| Unitário | `events.service` com repositório falso | CA-5, CA-6, CA-8, CA-9, CA-10 |
| Integração | rotas do organizador | CA-2, CA-5, CA-6, CA-7, CA-14 |
| Integração | rotas públicas | CA-11, CA-12, CA-13 |
| Integração | criação com capacidade `N` no banco | CA-5, RN-7 |

Nenhum teste toca a rede: os adapters recebem uma função `fetch` injetada, e os
payloads de referência ficam em `src/tests/fixtures/`.

## Riscos

| Risco | Mitigação |
| --- | --- |
| Avaliador sem chave de API vê catálogo vazio | Fábrica ignora provedor sem chave, `GET /catalog/search` responde 200 com lista vazia, e o README explica; o seed do Épico 7 cria eventos sem depender de rede |
| Formato das APIs externas muda | Só o adapter muda; contrato e domínio ficam parados |
| Mapa de assentos grande trava a transação | Teto de 500 e `createMany` numa chamada só |
| Regenerar mapa em rascunho apaga reservas | Não há reserva em rascunho: publicar é pré-requisito da reserva no Épico 4 |
