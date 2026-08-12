# Tasks 0003 — Catálogo e eventos

Quebra do [plan 0003](plan.md) em commits atômicos.

## Tarefas

- [ ] **T-1** — Contrato do catálogo (`catalog.types.ts`, `catalog.port.ts`) e as
      variáveis de ambiente dos provedores.
  - Commit: `feat(catalog): definir o contrato comum do catálogo externo`
  - Cobre: RN-1
  - Testes: unitário do env com e sem chaves

- [ ] **T-2** — Adapters do TMDb e do Ticketmaster, com `fetch` injetado, prazo
      próprio e tradução para `CatalogItem`.
  - Commit: `feat(catalog): traduzir TMDb e Ticketmaster para o contrato comum`
  - Cobre: CA-1, RN-4
  - Testes: unitário sobre payloads capturados; resposta de erro vira lista
    vazia; prazo estourado rejeita

- [ ] **T-3** — `catalog.factory.ts`: instancia só o que tem chave.
  - Commit: `feat(catalog): escolher os provedores por configuração`
  - Cobre: RN-2
  - Testes: unitário — nenhuma chave, uma chave, as duas

- [ ] **T-4** — `catalog.service.ts`: agrega com `allSettled` e cacheia no Redis.
  - Commit: `feat(catalog): agregar provedores e cachear a busca`
  - Cobre: CA-3, CA-4, RN-3
  - Testes: unitário — cache evita segunda chamada; provedor que falha não
    derruba os outros; Redis fora não quebra a busca

- [ ] **T-5** — `catalog.schema.ts` e `GET /catalog/search` restrita a organizador.
  - Commit: `feat(catalog): expor a busca no catálogo ao organizador`
  - Cobre: CA-1, CA-2
  - Testes: integração — 401 sem token, 403 como cliente, 200 como organizador

- [ ] **T-6** — `events.schema.ts` com criação, edição, filtro e saída.
  - Commit: `feat(events): definir os schemas de evento`
  - Cobre: —
  - Testes: unitário dos limites (capacidade, preço, paginação)

- [ ] **T-7** — `events.repository.ts`, incluindo criação de evento com mapa de
      assentos em transação e contagem de disponíveis.
  - Commit: `feat(events): persistir evento com o mapa de assentos`
  - Cobre: CA-5, RN-7
  - Testes: integração — capacidade `N` gera `N` assentos com rótulos únicos

- [ ] **T-8** — `events.service.ts`: dono, transições de estado e regeneração do
      mapa em rascunho.
  - Commit: `feat(events): aplicar as regras de dono e de estado do evento`
  - Cobre: CA-6, CA-8, CA-9, CA-10
  - Testes: unitário com repositório falso

- [ ] **T-9** — Controller, rotas e montagem no app.
  - Commit: `feat(events): expor as rotas de evento`
  - Cobre: CA-7, CA-11, CA-12, CA-13, CA-14
  - Testes: integração — organizador e público

- [ ] **T-10** — Documentar catálogo e eventos no OpenAPI.
  - Commit: `feat(docs): documentar as rotas de catálogo e evento`
  - Cobre: —
  - Testes: integração — rotas presentes no `/docs.json`

## Cobertura dos critérios de aceite

| Critério | Tarefa |
| --- | --- |
| CA-1 | T-2, T-5 |
| CA-2 | T-5 |
| CA-3 | T-4 |
| CA-4 | T-4 |
| CA-5 | T-7, T-9 |
| CA-6 | T-8, T-9 |
| CA-7 | T-9 |
| CA-8 | T-8 |
| CA-9 | T-8 |
| CA-10 | T-8 |
| CA-11 | T-9 |
| CA-12 | T-9 |
| CA-13 | T-9 |
| CA-14 | T-9 |

## Definição de pronto do épico

- [ ] Os catorze critérios cobertos por teste automatizado
- [ ] `npm run lint`, `npm run typecheck` e `npm test` sem erro
- [ ] Rotas novas no `/docs`
- [ ] Checkbox do Épico 3 no backlog do `CLAUDE.md`, e status no roadmap
- [ ] Nenhum segredo commitado; `.env.example` com as chaves novas
