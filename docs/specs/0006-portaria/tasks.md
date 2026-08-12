# Tasks 0006 — Portaria

Quebra do [plan 0006](plan.md) em commits atômicos.

## Tarefas

- [x] **T-1** — Schemas e repositório, com a marcação de uso atômica.
  - Commit: `feat(gate): marcar uso de ingresso de forma atômica`
  - Cobre: RN-3
  - Testes: integração — segunda marcação afeta zero linhas

- [x] **T-2** — `gate.service.ts` com a ordem das checagens e os quatro
      resultados.
  - Commit: `feat(gate): validar ingresso distinguindo os quatro resultados`
  - Cobre: CA-3, CA-4, CA-5, CA-9, RN-2, RN-5
  - Testes: unitário com repositório falso

- [x] **T-3** — Rotas de portaria e montagem.
  - Commit: `feat(gate): expor as rotas de validação e consulta`
  - Cobre: CA-1, CA-2, CA-7, CA-8, CA-10
  - Testes: integração

- [x] **T-4** — Teste de duas validações simultâneas.
  - Commit: `test(gate): provar que dois portões não validam o mesmo ingresso`
  - Cobre: CA-6, RN-4
  - Testes: integração contra Postgres real

- [x] **T-5** — Documentar a portaria no OpenAPI.
  - Commit: `feat(docs): documentar as rotas de portaria`
  - Cobre: —
  - Testes: integração — rotas no `/docs.json`

## Cobertura dos critérios de aceite

| Critério | Tarefa |
| --- | --- |
| CA-1 | T-3 |
| CA-2 | T-3 |
| CA-3 | T-2 |
| CA-4 | T-2 |
| CA-5 | T-2 |
| CA-6 | T-4 |
| CA-7 | T-3 |
| CA-8 | T-3 |
| CA-9 | T-2 |
| CA-10 | T-3 |

## Definição de pronto do épico

- [x] Os dez critérios cobertos por teste automatizado
- [x] `npm run lint`, `npm run typecheck` e `npm test` sem erro
- [x] Rotas novas no `/docs`
- [x] Checkbox do Épico 6 no backlog, e status no roadmap
